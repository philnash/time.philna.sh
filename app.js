const CITY_DATA_URL = '/data/cities.json';
const ROUTE_PREFIX = '/compare';
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATETIME_PATH_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}$/;
const THEME_STORAGE_KEY = 'timetime-theme';
const VALID_THEME_CHOICES = new Set(['system', 'light', 'dark']);
const HEADER_ICON_DEFAULT = '/assets/icon.svg';
const HEADER_ICON_LIGHT = '/assets/icon-light.svg';

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
  copyLink: document.getElementById('copy-link'),
  nowButton: document.getElementById('set-now'),
  includeDateInLink: document.getElementById('share-include-datetime'),
  shareToggle: document.getElementById('share-toggle'),
  sharePanel: document.getElementById('share-panel'),
  brandIcon: document.querySelector('.brand-icon'),
  themeToggle: document.querySelector('.theme-toggle'),
};

const formatters = new Map();
const citiesBySlug = new Map();
let cities = [];
let searchResults = [];
let themeChoice = 'system';
let includeDateInUrl = true;
let sharePanelHideTimer = null;
let sharePanelCloseTransitionHandler = null;

const hasNavigationApi =
  typeof window !== 'undefined' &&
  typeof window.navigation === 'object' &&
  typeof window.navigation.navigate === 'function';
const systemThemeQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getFormatter(timeZone, options, locale) {
  const localeKey = Array.isArray(locale) ? locale.join(',') : locale || 'default';
  const key = `${localeKey}:${timeZone}:${JSON.stringify(options)}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.DateTimeFormat(locale, {
        timeZone,
        ...options,
      }),
    );
  }

  return formatters.get(key);
}

function getTimeZoneNamePart(epochMs, timeZone, style, locale) {
  try {
    const parts = getFormatter(timeZone, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: style,
    }, locale).formatToParts(new Date(epochMs));

    return parts.find((part) => part.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

function normalizeOffsetLabel(label) {
  if (!label) {
    return '';
  }

  const normalized = label.trim().replace(/^GMT/i, 'UTC');
  return normalized === 'UTC' ? 'UTC+00:00' : normalized;
}

function isOffsetLikeZoneName(label) {
  if (!label) {
    return true;
  }

  return /^(?:GMT|UTC)(?:[+-]\d{1,2}(?::?\d{2})?)?$/i.test(label.trim());
}

function localeCandidatesForCountry(countryCode) {
  const list = [];

  if (countryCode && /^[A-Z]{2}$/.test(countryCode)) {
    list.push(`en-${countryCode}`);
  }

  if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) {
    for (const locale of navigator.languages) {
      if (locale) {
        list.push(locale);
      }
    }
  }

  list.push(undefined);

  return [...new Set(list)];
}

function getPreferredShortZoneName(epochMs, timeZone, countryCode) {
  const locales = localeCandidatesForCountry(countryCode);
  let fallbackName = '';

  for (const locale of locales) {
    const shortName = getTimeZoneNamePart(epochMs, timeZone, 'short', locale);
    if (!shortName) {
      continue;
    }

    if (!fallbackName) {
      fallbackName = shortName;
    }

    if (!isOffsetLikeZoneName(shortName)) {
      return shortName;
    }
  }

  return fallbackName;
}

function getCurrentZoneLabel(epochMs, timeZone, countryCode) {
  const offset = normalizeOffsetLabel(getTimeZoneNamePart(epochMs, timeZone, 'shortOffset'));
  const shortName = getPreferredShortZoneName(epochMs, timeZone, countryCode);
  const normalizedShortName = normalizeOffsetLabel(shortName);

  if (shortName && offset && normalizeText(offset) !== normalizeText(normalizedShortName)) {
    return `${shortName} (${offset})`;
  }

  return offset || shortName || timeZone;
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

function formatNowAsLocalInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatDateTimeLocalFromParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function formatNowForTimeZone(timeZone) {
  if (!timeZone) {
    return formatNowAsLocalInput();
  }

  return formatDateTimeLocalFromParts(getZonedParts(Date.now(), timeZone));
}

function minutesToTimeString(totalMinutes) {
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function serializePath(current, withDateTime = includeDateInUrl) {
  if (!current.cities.length) {
    return '/';
  }

  const basePath = `${ROUTE_PREFIX}/${current.cities.join('/')}`;
  if (!withDateTime) {
    return basePath;
  }

  return `${basePath}/${toPathDateTime(current.dateTime)}`;
}

function navigateToPath(path, mode = 'push') {
  if (hasNavigationApi) {
    window.navigation.navigate(path, { history: mode });
    return;
  }

  if (mode === 'replace') {
    history.replaceState(null, '', path);
    return;
  }

  history.pushState(null, '', path);
}

function parsePath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== ROUTE_PREFIX.replace('/', '')) {
    return null;
  }

  const dateTimeSegment = decodeURIComponent(segments[segments.length - 1]);
  const parsedDateTime = fromPathDateTime(dateTimeSegment);
  const pathIncludesDateTime = Boolean(parsedDateTime);

  const cityPathSegments = pathIncludesDateTime ? segments.slice(1, -1) : segments.slice(1);
  const candidateCities = cityPathSegments.map((segment) => decodeURIComponent(segment));
  if (!candidateCities.length) {
    return null;
  }

  const uniqueCities = [...new Set(candidateCities)].filter((slug) => citiesBySlug.has(slug));
  if (!uniqueCities.length) {
    return null;
  }

  const anchorCity = citiesBySlug.get(uniqueCities[0]);
  const dateTime = parsedDateTime || formatNowForTimeZone(anchorCity?.timeZone);

  return {
    cities: uniqueCities,
    dateTime,
    source: 'url',
    pathIncludesDateTime,
  };
}

function updateMessage(text = '') {
  refs.message.textContent = text;
}

function updateRoutePreview() {
  refs.routePreview.value = `${location.origin}${serializePath(state)}`;
}

function clearSharePanelCloseCallbacks() {
  if (sharePanelHideTimer) {
    window.clearTimeout(sharePanelHideTimer);
    sharePanelHideTimer = null;
  }

  if (sharePanelCloseTransitionHandler && refs.sharePanel) {
    refs.sharePanel.removeEventListener('transitionend', sharePanelCloseTransitionHandler);
    sharePanelCloseTransitionHandler = null;
  }
}

function setSharePanelOpen(isOpen) {
  if (!refs.sharePanel || !refs.shareToggle) {
    return;
  }

  const panel = refs.sharePanel;
  const toggle = refs.shareToggle;

  clearSharePanelCloseCallbacks();

  toggle.setAttribute('aria-expanded', String(isOpen));
  panel.setAttribute('aria-hidden', String(!isOpen));
  if ('inert' in panel) {
    panel.inert = !isOpen;
  }

  if (isOpen) {
    panel.hidden = false;
    window.requestAnimationFrame(() => {
      panel.classList.add('is-open');
    });
    return;
  }

  panel.classList.remove('is-open');
  if (panel.hidden) {
    return;
  }

  const finishClose = () => {
    clearSharePanelCloseCallbacks();
    if (toggle.getAttribute('aria-expanded') === 'true') {
      return;
    }
    panel.hidden = true;
  };

  sharePanelCloseTransitionHandler = (event) => {
    if (event.target !== panel || event.propertyName !== 'max-height') {
      return;
    }
    finishClose();
  };

  panel.addEventListener('transitionend', sharePanelCloseTransitionHandler);
  sharePanelHideTimer = window.setTimeout(finishClose, 220);
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

function hideSearchResults() {
  refs.results.hidden = true;
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

    row.querySelector('.city-name').textContent = `${city.name}, ${city.countryCode}`;
    row.querySelector('.city-meta').textContent = `${city.timeZone}`;
    const zoneNow = row.querySelector('.city-zone-now');
    if (zoneNow) {
      zoneNow.textContent = getCurrentZoneLabel(anchorMs, city.timeZone, city.countryCode);
    }
    const cityParts = getZonedParts(anchorMs, city.timeZone);
    const cityMinutes = cityParts.hour * 60 + cityParts.minute;

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
    const timeSlider = row.querySelector('input[data-action="time-slider"]');
    if (timeSlider) {
      timeSlider.value = String(cityMinutes);
      timeSlider.setAttribute('aria-label', `Set time using ${city.name}`);
      timeSlider.setAttribute('aria-valuetext', minutesToTimeString(cityMinutes));
    }

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

function applyState(nextState, historyMode = 'push') {
  state.cities = nextState.cities;
  state.dateTime = nextState.dateTime;
  state.source = nextState.source || 'ui';
  if (typeof nextState.pathIncludesDateTime === 'boolean') {
    includeDateInUrl = nextState.pathIncludesDateTime;
  }

  refs.datetime.value = state.dateTime;
  if (refs.includeDateInLink) {
    refs.includeDateInLink.checked = includeDateInUrl;
  }
  renderCities();
  updateRoutePreview();

  const nextPath = serializePath(state);
  if (historyMode !== 'none' && location.pathname !== nextPath) {
    navigateToPath(nextPath, historyMode);
  }
}

function replacePathFromState() {
  const nextPath = serializePath(state);
  if (location.pathname !== nextPath) {
    navigateToPath(nextPath, 'replace');
  }
}

function buildDefaultState() {
  return {
    cities: [],
    dateTime: formatNowAsLocalInput(),
    source: 'default',
    pathIncludesDateTime: true,
  };
}

function nowForCurrentAnchor() {
  const anchor = citiesBySlug.get(state.cities[0]);
  if (!anchor?.timeZone) {
    return formatNowAsLocalInput();
  }

  return formatNowForTimeZone(anchor.timeZone);
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
  if (!state.cities.includes(slug)) {
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

function buildAnchorDateTimeFromCitySlider(slug, totalMinutes) {
  if (!Number.isFinite(totalMinutes)) {
    return null;
  }

  const anchor = citiesBySlug.get(state.cities[0]);
  const city = citiesBySlug.get(slug);
  if (!anchor || !city) {
    return null;
  }

  const normalizedMinutes = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const anchorMs = anchorLocalToEpoch(state.dateTime, anchor.timeZone);
  const cityParts = getZonedParts(anchorMs, city.timeZone);
  const cityDatePart = `${cityParts.year}-${String(cityParts.month).padStart(2, '0')}-${String(cityParts.day).padStart(2, '0')}`;
  const nextCityDateTime = `${cityDatePart}T${minutesToTimeString(normalizedMinutes)}`;
  const nextEpoch = anchorLocalToEpoch(nextCityDateTime, city.timeZone);
  return formatDateTimeLocalFromParts(getZonedParts(nextEpoch, anchor.timeZone));
}

function setTimeFromCitySlider(slug, totalMinutes, historyMode = 'replace') {
  const nextAnchorDateTime = buildAnchorDateTimeFromCitySlider(slug, totalMinutes);
  if (!nextAnchorDateTime) {
    return;
  }

  if (nextAnchorDateTime !== state.dateTime) {
    applyState({ ...state, dateTime: nextAnchorDateTime, source: 'ui' }, historyMode);
  }
}

function renderRowsForAnchorDateTime(anchorDateTime, activeSliderSlug = '') {
  const anchor = citiesBySlug.get(state.cities[0]);
  if (!anchor) {
    return;
  }

  const anchorMs = anchorLocalToEpoch(anchorDateTime, anchor.timeZone);
  const rows = refs.list.querySelectorAll('.city-row');
  for (const row of rows) {
    const rowSlug = row.dataset.slug;
    const city = citiesBySlug.get(rowSlug);
    if (!city) {
      continue;
    }

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

    const zoneNow = row.querySelector('.city-zone-now');
    if (zoneNow) {
      zoneNow.textContent = getCurrentZoneLabel(anchorMs, city.timeZone, city.countryCode);
    }

    const cityParts = getZonedParts(anchorMs, city.timeZone);
    const cityMinutes = cityParts.hour * 60 + cityParts.minute;
    const timeSlider = row.querySelector('input[data-action="time-slider"]');
    if (!timeSlider) {
      continue;
    }

    const sliderMinutes = rowSlug === activeSliderSlug ? Number(timeSlider.value) : cityMinutes;
    timeSlider.setAttribute('aria-valuetext', minutesToTimeString(sliderMinutes));

    if (rowSlug !== activeSliderSlug) {
      timeSlider.value = String(cityMinutes);
    }
  }
}

function updateThemeButtons() {
  const buttons = refs.themeToggle.querySelectorAll('button[data-theme-choice]');
  for (const button of buttons) {
    const isActive = button.dataset.themeChoice === themeChoice;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
}

function resolvedThemeMode() {
  if (themeChoice !== 'system') {
    return themeChoice;
  }

  return systemThemeQuery?.matches ? 'dark' : 'light';
}

function updateBrandIcon() {
  if (!refs.brandIcon) {
    return;
  }

  refs.brandIcon.src = resolvedThemeMode() === 'dark' ? HEADER_ICON_LIGHT : HEADER_ICON_DEFAULT;
}

function applyThemeChoice(choice, persist = true) {
  themeChoice = VALID_THEME_CHOICES.has(choice) ? choice : 'system';

  if (themeChoice === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', themeChoice);
  }

  if (persist) {
    try {
      if (themeChoice === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, themeChoice);
      }
    } catch {
      // Ignore storage failures (for example private browsing restrictions).
    }
  }

  updateThemeButtons();
  updateBrandIcon();
}

function initTheme() {
  let storedChoice = null;
  try {
    storedChoice = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    storedChoice = null;
  }

  const initialChoice = VALID_THEME_CHOICES.has(storedChoice) ? storedChoice : 'system';
  applyThemeChoice(initialChoice, false);
}

async function copyShareLink() {
  const url = refs.routePreview.value;
  try {
    await navigator.clipboard.writeText(url);
    updateMessage('Link copied to clipboard.');
  } catch {
    refs.routePreview.focus();
    refs.routePreview.select();
    const copied = document.execCommand && document.execCommand('copy');
    updateMessage(copied ? 'Link copied to clipboard.' : 'Unable to copy link.');
  }
}

function bindEvents() {
  if (refs.nowButton) {
    refs.nowButton.addEventListener('click', () => {
      const next = nowForCurrentAnchor();
      if (next !== state.dateTime) {
        applyState({ ...state, dateTime: next, source: 'ui' }, 'push');
      }
    });
  }

  refs.datetime.addEventListener('change', () => {
    const next = refs.datetime.value;
    if (!DATETIME_PATTERN.test(next)) {
      updateMessage('Invalid date/time format.');
      refs.datetime.value = state.dateTime;
      return;
    }

    applyState({ ...state, dateTime: next, source: 'ui' }, 'push');
  });

  refs.search.addEventListener('input', () => {
    searchResults = searchCities(refs.search.value);
    renderSearchResults();
  });

  refs.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && searchResults.length > 0) {
      event.preventDefault();
      addCity(searchResults[0].slug);
    }
  });

  refs.search.addEventListener('blur', () => {
    setTimeout(() => {
      hideSearchResults();
    }, 120);
  });

  refs.results.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  refs.results.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-slug]');
    if (!button) {
      return;
    }

    addCity(button.dataset.slug);
  });

  refs.list.addEventListener('input', (event) => {
    const timeSlider = event.target.closest('input[data-action="time-slider"]');
    if (!timeSlider) {
      return;
    }

    const row = timeSlider.closest('.city-row');
    if (!row || !row.dataset.slug) {
      return;
    }

    const minutes = Number(timeSlider.value);
    timeSlider.setAttribute('aria-valuetext', minutesToTimeString(minutes));

    const previewAnchorDateTime = buildAnchorDateTimeFromCitySlider(row.dataset.slug, minutes);
    if (!previewAnchorDateTime) {
      return;
    }

    refs.datetime.value = previewAnchorDateTime;
    renderRowsForAnchorDateTime(previewAnchorDateTime, row.dataset.slug);
  });

  refs.list.addEventListener('change', (event) => {
    const timeSlider = event.target.closest('input[data-action="time-slider"]');
    if (!timeSlider) {
      return;
    }

    const row = timeSlider.closest('.city-row');
    if (!row || !row.dataset.slug) {
      return;
    }

    setTimeFromCitySlider(row.dataset.slug, Number(timeSlider.value), 'replace');
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

  refs.copyLink.addEventListener('click', () => {
    copyShareLink();
  });

  if (refs.shareToggle) {
    refs.shareToggle.addEventListener('click', () => {
      const isOpen = refs.shareToggle.getAttribute('aria-expanded') === 'true';
      setSharePanelOpen(!isOpen);
    });
  }

  if (refs.includeDateInLink) {
    refs.includeDateInLink.addEventListener('change', () => {
      includeDateInUrl = refs.includeDateInLink.checked;
      updateRoutePreview();
      replacePathFromState();
    });
  }

  refs.themeToggle.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-theme-choice]');
    if (!button) {
      return;
    }

    applyThemeChoice(button.dataset.themeChoice, true);
  });

  if (systemThemeQuery) {
    const onSystemThemeChange = () => {
      if (themeChoice === 'system') {
        updateBrandIcon();
      }
    };

    if (typeof systemThemeQuery.addEventListener === 'function') {
      systemThemeQuery.addEventListener('change', onSystemThemeChange);
    } else if (typeof systemThemeQuery.addListener === 'function') {
      systemThemeQuery.addListener(onSystemThemeChange);
    }
  }

  if (hasNavigationApi) {
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
          applyState(parsed, 'none');
        },
      });
    });
    return;
  }

  window.addEventListener('popstate', () => {
    const parsed = parsePath(location.pathname);
    if (parsed) {
      applyState(parsed, 'none');
      return;
    }

    const defaultState = buildDefaultState();
    applyState(defaultState, 'none');
    replacePathFromState();
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
  initTheme();

  const response = await fetch(CITY_DATA_URL);
  cities = await response.json();
  for (const city of cities) {
    citiesBySlug.set(city.slug, city);
  }

  const parsedFromPath = parsePath(location.pathname);
  const defaultState = buildDefaultState();

  applyState(
    {
      cities: parsedFromPath?.cities || defaultState.cities,
      dateTime: parsedFromPath?.dateTime || defaultState.dateTime,
      source: parsedFromPath ? 'url' : defaultState.source,
      pathIncludesDateTime: parsedFromPath?.pathIncludesDateTime ?? defaultState.pathIncludesDateTime,
    },
    'none',
  );

  setSharePanelOpen(false);

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
