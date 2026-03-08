const CITY_DATA_URL = '/data/cities.json';
const DEFAULT_CITY_SLUGS = ['melbourne-au', 'new-york-us'];
const ROUTE_PREFIX = '/compare';
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATETIME_PATH_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}$/;

const state = {
  cities: [],
  dateTime: '',
  source: 'init',
};

const refs = {
  datetime: document.getElementById('datetime'),
  search: document.getElementById('city-search'),
  results: document.getElementById('search-results'),
  list: document.getElementById('cities'),
  template: document.getElementById('city-row-template'),
  message: document.getElementById('message'),
  routePreview: document.getElementById('route-preview'),
};

const formatters = new Map();
const citiesBySlug = new Map();
let cities = [];
let searchResults = [];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getFormatter(timeZone, options) {
  const key = `${timeZone}:${JSON.stringify(options)}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        ...options,
      }),
    );
  }

  return formatters.get(key);
}

function getZonedParts(epochMs, timeZone) {
  const parts = getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function parseDateTimeLocal(value) {
  if (!DATETIME_PATTERN.test(value)) {
    return null;
  }

  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  return { year, month, day, hour, minute };
}

function toPathDateTime(value) {
  if (!DATETIME_PATTERN.test(value)) {
    return value;
  }

  return value.replace(':', '-');
}

function fromPathDateTime(value) {
  if (!DATETIME_PATH_PATTERN.test(value)) {
    return null;
  }

  if (DATETIME_PATTERN.test(value)) {
    return value;
  }

  return value.replace(/T(\d{2})-(\d{2})$/, 'T$1:$2');
}

function componentMinutes(components) {
  return Math.floor(
    Date.UTC(
      components.year,
      components.month - 1,
      components.day,
      components.hour,
      components.minute,
      0,
      0,
    ) / 60000,
  );
}

function anchorLocalToEpoch(localDateTime, timeZone) {
  const parts = parseDateTimeLocal(localDateTime);
  if (!parts) {
    return Date.now();
  }

  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  const desiredMinutes = componentMinutes(parts);

  for (let i = 0; i < 6; i += 1) {
    const observed = getZonedParts(guess, timeZone);
    const observedMinutes = componentMinutes(observed);
    const deltaMinutes = desiredMinutes - observedMinutes;

    if (deltaMinutes === 0) {
      return guess;
    }

    guess += deltaMinutes * 60_000;
  }

  return guess;
}

function dateKey(epochMs, timeZone) {
  const parts = getZonedParts(epochMs, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function dayDelta(anchorMs, anchorZone, targetZone) {
  const anchorKey = dateKey(anchorMs, anchorZone);
  const targetKey = dateKey(anchorMs, targetZone);

  const anchorDate = new Date(`${anchorKey}T00:00:00Z`);
  const targetDate = new Date(`${targetKey}T00:00:00Z`);
  return Math.round((targetDate.getTime() - anchorDate.getTime()) / 86_400_000);
}

function formatDayDelta(delta) {
  if (delta === 0) {
    return 'Same day';
  }

  if (delta === 1) {
    return 'Next day';
  }

  if (delta === -1) {
    return 'Previous day';
  }

  return `${delta > 0 ? '+' : ''}${delta} days`;
}

function formatNowInTimeZone(timeZone) {
  const parts = getZonedParts(Date.now(), timeZone);
  const year = parts.year;
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function serializePath(current) {
  return `${ROUTE_PREFIX}/${current.cities.join('/')}/${toPathDateTime(current.dateTime)}`;
}

function parsePath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 3 || segments[0] !== ROUTE_PREFIX.replace('/', '')) {
    return null;
  }

  const dateTimeSegment = decodeURIComponent(segments[segments.length - 1]);
  const dateTime = fromPathDateTime(dateTimeSegment);
  if (!dateTime) {
    return null;
  }

  const candidateCities = segments.slice(1, -1).map((segment) => decodeURIComponent(segment));
  if (!candidateCities.length) {
    return null;
  }

  const uniqueCities = [...new Set(candidateCities)].filter((slug) => citiesBySlug.has(slug));
  if (!uniqueCities.length) {
    return null;
  }

  return {
    cities: uniqueCities,
    dateTime,
    source: 'url',
  };
}

function updateMessage(text = '') {
  refs.message.textContent = text;
}

function updateRoutePreview() {
  refs.routePreview.textContent = serializePath(state);
}

function searchCities(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [];
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return cities
    .filter((city) => {
      const haystack = normalizeText(
        `${city.name} ${city.country} ${city.countryCode} ${city.timeZone} ${city.slug} ${(city.aliases || []).join(' ')}`,
      );

      return tokens.every((token) => haystack.includes(token));
    })
    .filter((city) => !state.cities.includes(city.slug))
    .slice(0, 12);
}

function renderSearchResults() {
  refs.results.innerHTML = '';

  if (!searchResults.length) {
    refs.results.hidden = true;
    return;
  }

  for (const city of searchResults) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.slug = city.slug;
    button.textContent = `${city.name}, ${city.countryCode} (${city.timeZone})`;
    item.appendChild(button);
    refs.results.appendChild(item);
  }

  refs.results.hidden = false;
}

function renderCities() {
  refs.list.innerHTML = '';

  if (!state.cities.length) {
    updateMessage('No cities selected. Search and add a city to begin.');
    return;
  }

  const anchor = citiesBySlug.get(state.cities[0]);
  const anchorMs = anchorLocalToEpoch(state.dateTime, anchor.timeZone);

  for (const [index, slug] of state.cities.entries()) {
    const city = citiesBySlug.get(slug);
    if (!city) {
      continue;
    }

    const row = refs.template.content.firstElementChild.cloneNode(true);
    row.dataset.slug = slug;
    if (index === 0) {
      row.classList.add('anchor');
    }

    row.querySelector('.city-name').textContent = `${city.name}, ${city.countryCode}${index === 0 ? ' (Anchor)' : ''}`;
    row.querySelector('.city-meta').textContent = `${city.timeZone}`;

    const timeLine = getFormatter(city.timeZone, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(anchorMs));

    const dateLine = getFormatter(city.timeZone, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(anchorMs));

    const delta = dayDelta(anchorMs, anchor.timeZone, city.timeZone);

    row.querySelector('.time-line').textContent = timeLine;
    row.querySelector('.date-line').textContent = dateLine;
    row.querySelector('.delta-line').textContent = formatDayDelta(delta);

    const up = row.querySelector('button[data-action="up"]');
    const down = row.querySelector('button[data-action="down"]');
    if (index === 0) {
      up.disabled = true;
    }
    if (index === state.cities.length - 1) {
      down.disabled = true;
    }

    refs.list.appendChild(row);
  }

  updateMessage('');
}

function applyState(nextState, pushHistory = true) {
  state.cities = nextState.cities;
  state.dateTime = nextState.dateTime;
  state.source = nextState.source || 'ui';

  refs.datetime.value = state.dateTime;
  renderCities();
  updateRoutePreview();

  const nextPath = serializePath(state);
  if (pushHistory && location.pathname !== nextPath) {
    window.navigation.navigate(nextPath, { history: 'push' });
  }
}

function replacePathFromState() {
  const nextPath = serializePath(state);
  if (location.pathname !== nextPath) {
    window.navigation.navigate(nextPath, { history: 'replace' });
  }
}

function moveCity(slug, direction) {
  const index = state.cities.indexOf(slug);
  if (index === -1) {
    return;
  }

  const target = index + direction;
  if (target < 0 || target >= state.cities.length) {
    return;
  }

  const next = [...state.cities];
  [next[index], next[target]] = [next[target], next[index]];
  applyState({ ...state, cities: next, source: 'ui' });
}

function removeCity(slug) {
  if (state.cities.length <= 1) {
    updateMessage('At least one city is required.');
    return;
  }

  const nextCities = state.cities.filter((citySlug) => citySlug !== slug);
  applyState({ ...state, cities: nextCities, source: 'ui' });
}

function addCity(slug) {
  if (!citiesBySlug.has(slug) || state.cities.includes(slug)) {
    return;
  }

  const nextCities = [...state.cities, slug];
  applyState({ ...state, cities: nextCities, source: 'ui' });
  refs.search.value = '';
  searchResults = [];
  renderSearchResults();
}

function bindEvents() {
  refs.datetime.addEventListener('change', () => {
    const next = refs.datetime.value;
    if (!DATETIME_PATTERN.test(next)) {
      updateMessage('Invalid date/time format.');
      refs.datetime.value = state.dateTime;
      return;
    }

    applyState({ ...state, dateTime: next, source: 'ui' });
  });

  refs.search.addEventListener('input', () => {
    searchResults = searchCities(refs.search.value);
    renderSearchResults();
  });

  refs.search.addEventListener('blur', () => {
    setTimeout(() => {
      refs.results.hidden = true;
    }, 120);
  });

  refs.results.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-slug]');
    if (!button) {
      return;
    }

    addCity(button.dataset.slug);
  });

  refs.list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const row = button.closest('.city-row');
    if (!row) {
      return;
    }

    const { slug } = row.dataset;
    const action = button.dataset.action;

    if (action === 'up') {
      moveCity(slug, -1);
    }

    if (action === 'down') {
      moveCity(slug, 1);
    }

    if (action === 'remove') {
      removeCity(slug);
    }
  });

  window.navigation.addEventListener('navigate', (event) => {
    const destination = new URL(event.destination.url);
    if (destination.origin !== location.origin) {
      return;
    }

    const parsed = parsePath(destination.pathname);
    if (!parsed) {
      return;
    }

    event.intercept({
      handler: async () => {
        applyState(parsed, false);
      },
    });
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.error('Service worker registration failed', error);
  }
}

async function init() {
  if (!window.navigation) {
    updateMessage('This app requires the Web Navigation API and a modern browser.');
    return;
  }

  const response = await fetch(CITY_DATA_URL);
  cities = await response.json();
  for (const city of cities) {
    citiesBySlug.set(city.slug, city);
  }

  const parsedFromPath = parsePath(location.pathname);

  const fallbackCities = DEFAULT_CITY_SLUGS.filter((slug) => citiesBySlug.has(slug));
  const selectedCities = parsedFromPath?.cities || fallbackCities;
  const anchorForDefault = citiesBySlug.get(selectedCities[0]) || cities[0];
  const dateTime = parsedFromPath?.dateTime || formatNowInTimeZone(anchorForDefault.timeZone);

  applyState(
    {
      cities: selectedCities.length ? selectedCities : [cities[0].slug],
      dateTime,
      source: parsedFromPath ? 'url' : 'default',
    },
    false,
  );

  const canonicalPath = serializePath(state);
  if (location.pathname !== canonicalPath) {
    replacePathFromState();
  }

  bindEvents();
  registerServiceWorker();
}

init().catch((error) => {
  console.error(error);
  updateMessage('Unable to initialize app.');
});
