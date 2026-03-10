const { test, expect } = require('@playwright/test');
const {
  addCityBySlug,
  cityRow,
  displayedDateTime,
  getOrderedCitySlugs,
  getSavedCitySlugs,
  openSharePanel,
  SAVED_CITIES_STORAGE_KEY,
  setDateTime,
  setSliderValue,
} = require('./helpers');

const MELBOURNE_SLUG = 'melbourne-au';
const NEW_YORK_SLUG = 'new-york-us';
const DEFAULT_COMPARE_URL_PATTERN =
  /\/compare\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}$/;

test('initial load shows empty state and closed share panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#cities .city-row')).toHaveCount(0);
  await expect(page.locator('#message')).toContainText('No cities selected');
  await expect(page.locator('#share-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#share-panel')).toBeHidden();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
});

test('search and add city updates list and URL', async ({ page }) => {
  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);

  await expect(page.locator('#cities .city-row')).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`/compare/${MELBOURNE_SLUG}/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}$`));
  await expect.poll(() => getSavedCitySlugs(page)).toEqual([MELBOURNE_SLUG]);
});

test('root restores saved cities from local storage and rewrites to compare path', async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, citySlugs }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(citySlugs));
    },
    { storageKey: SAVED_CITIES_STORAGE_KEY, citySlugs: [MELBOURNE_SLUG, NEW_YORK_SLUG] },
  );

  await page.goto('/');

  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([MELBOURNE_SLUG, NEW_YORK_SLUG]);
  await expect(page).toHaveURL(
    new RegExp(`/compare/${MELBOURNE_SLUG}/${NEW_YORK_SLUG}/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}$`),
  );
  await expect.poll(() => getSavedCitySlugs(page)).toEqual([MELBOURNE_SLUG, NEW_YORK_SLUG]);
});

test('adding second city and reordering updates row order and URL', async ({ page }) => {
  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);
  await addCityBySlug(page, NEW_YORK_SLUG, NEW_YORK_SLUG);

  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([MELBOURNE_SLUG, NEW_YORK_SLUG]);

  await cityRow(page, MELBOURNE_SLUG).locator('button[data-action="down"]').click();

  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([NEW_YORK_SLUG, MELBOURNE_SLUG]);
  await expect(page).toHaveURL(
    new RegExp(`/compare/${NEW_YORK_SLUG}/${MELBOURNE_SLUG}/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}$`),
  );
  await expect.poll(() => getSavedCitySlugs(page)).toEqual([NEW_YORK_SLUG, MELBOURNE_SLUG]);
});

test('removing cities updates URL and returns to root when all are removed', async ({ page }) => {
  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);
  await addCityBySlug(page, NEW_YORK_SLUG, NEW_YORK_SLUG);

  await cityRow(page, NEW_YORK_SLUG).locator('button[data-action="remove"]').click();
  await expect(page.locator('#cities .city-row')).toHaveCount(1);
  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([MELBOURNE_SLUG]);
  await expect(page).toHaveURL(new RegExp(`/compare/${MELBOURNE_SLUG}/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}$`));
  await expect.poll(() => getSavedCitySlugs(page)).toEqual([MELBOURNE_SLUG]);

  await cityRow(page, MELBOURNE_SLUG).locator('button[data-action="remove"]').click();
  await expect(page.locator('#cities .city-row')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect.poll(() => getSavedCitySlugs(page)).toBeNull();
});

test('valid compare URL overrides saved cities and becomes the new root default', async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, citySlugs }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(citySlugs));
    },
    { storageKey: SAVED_CITIES_STORAGE_KEY, citySlugs: [MELBOURNE_SLUG] },
  );

  await page.goto('/compare/new-york-us/melbourne-au/2026-03-08T09-30');

  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([NEW_YORK_SLUG, MELBOURNE_SLUG]);
  await expect(page.locator('#date')).toHaveValue('2026-03-08');
  await expect(page.locator('#time')).toHaveValue('09:30');
  await expect.poll(() => getSavedCitySlugs(page)).toEqual([NEW_YORK_SLUG, MELBOURNE_SLUG]);
});

test('invalid compare URL does not consume or overwrite saved cities', async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, citySlugs }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(citySlugs));
    },
    { storageKey: SAVED_CITIES_STORAGE_KEY, citySlugs: [MELBOURNE_SLUG, NEW_YORK_SLUG] },
  );

  await page.goto('/compare/not-a-city');

  await expect(page.locator('#cities .city-row')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect.poll(() => getSavedCitySlugs(page)).toEqual([MELBOURNE_SLUG, NEW_YORK_SLUG]);
});

test('date and time inputs update app state and path datetime segment', async ({ page }) => {
  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);

  const dateLine = cityRow(page, MELBOURNE_SLUG).locator('.date-line');
  const beforeDateLine = (await dateLine.textContent()) || '';

  await setDateTime(page, '2030-01-15T09:25');

  await expect(page).toHaveURL(/\/compare\/melbourne-au\/2030-01-15T09-25$/);
  await expect(dateLine).not.toHaveText(beforeDateLine);
});

test('controls layout stays stable across narrow and wide viewports', async ({ page }) => {
  const cases = [
    { width: 320, height: 844, searchBelowTopRow: true },
    { width: 390, height: 844, searchBelowTopRow: true },
    { width: 600, height: 900, searchBelowTopRow: true },
    { width: 800, height: 900, searchBelowTopRow: false },
    { width: 1280, height: 900, searchBelowTopRow: false },
  ];

  for (const testCase of cases) {
    await page.setViewportSize({ width: testCase.width, height: testCase.height });
    await page.goto('/');

    const layout = await page.evaluate(() => {
      const time = document.getElementById('time');
      const date = document.getElementById('date');
      const now = document.getElementById('set-now');
      const search = document.getElementById('city-search');
      const rect = (element) => element.getBoundingClientRect();
      const timeRect = rect(time);
      const dateRect = rect(date);
      const nowRect = rect(now);
      const searchRect = rect(search);
      const topRowBottom = Math.max(timeRect.bottom, dateRect.bottom, nowRect.bottom);
      const overlapNowSearch = !(
        nowRect.right <= searchRect.left ||
        searchRect.right <= nowRect.left ||
        nowRect.bottom <= searchRect.top ||
        searchRect.bottom <= nowRect.top
      );

      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sameTopRow:
          Math.abs(timeRect.bottom - nowRect.bottom) < 2 &&
          Math.abs(dateRect.bottom - nowRect.bottom) < 2,
        equalHeights:
          Math.abs(timeRect.height - nowRect.height) < 2 &&
          Math.abs(dateRect.height - nowRect.height) < 2,
        searchBelowTopRow: searchRect.y > topRowBottom,
        overlapNowSearch,
        gapNowToSearch: searchRect.left - nowRect.right,
      };
    });

    expect(layout.viewport, `viewport width ${testCase.width}`).toBe(testCase.width);
    expect(layout.scrollWidth, `scroll width at ${testCase.width}`).toBe(testCase.width);
    expect(layout.sameTopRow, `top row alignment at ${testCase.width}`).toBe(true);
    expect(layout.equalHeights, `control heights at ${testCase.width}`).toBe(true);
    expect(layout.searchBelowTopRow, `search wrapping at ${testCase.width}`).toBe(
      testCase.searchBelowTopRow,
    );
    expect(layout.overlapNowSearch, `search overlap at ${testCase.width}`).toBe(false);
    if (!testCase.searchBelowTopRow) {
      expect(layout.gapNowToSearch, `search gap at ${testCase.width}`).toBeGreaterThan(8);
    }
  }
});

test('city row uses a consistent compact layout across responsive widths', async ({ page }) => {
  const cases = [
    { width: 320, height: 844, scaleHidden: false },
    { width: 500, height: 900, scaleHidden: false },
    { width: 600, height: 900, scaleHidden: false },
    { width: 800, height: 900, scaleHidden: false },
    { width: 1280, height: 900, scaleHidden: false },
  ];

  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, SAVED_CITIES_STORAGE_KEY);

  for (const testCase of cases) {
    await page.setViewportSize({ width: testCase.width, height: testCase.height });
    await page.goto('/');
    await addCityBySlug(page, NEW_YORK_SLUG, NEW_YORK_SLUG);

    const layout = await page.evaluate(() => {
      const article = document.querySelector('.city-row article');
      const main = article.querySelector('.city-main');
      const time = article.querySelector('.city-time');
      const scrubber = article.querySelector('.city-time-scrubber');
      const actions = article.querySelector('.city-actions');
      const country = article.querySelector('.city-country');
      const scale = article.querySelector('.city-time-scale');
      const articleRect = article.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      const timeRect = time.getBoundingClientRect();
      const scrubberRect = scrubber.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const scrubberGap = actionsRect.left - scrubberRect.right;

      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scaleHidden: getComputedStyle(scale).display === 'none',
        countryOnOwnLine: getComputedStyle(country).display === 'block',
        timeOnRight: timeRect.x >= mainRect.x + Math.min(mainRect.width * 0.55, 80),
        actionsBelowTime: actionsRect.y >= timeRect.bottom - 1,
        scrubberFillsAvailableWidth: scrubberGap >= 8 && scrubberGap <= 18,
        scrubberOnLeft: scrubberRect.x < actionsRect.x,
        articleFitsViewport: Math.round(articleRect.right) <= window.innerWidth - 1,
      };
    });

    expect(layout.viewport, `viewport width ${testCase.width}`).toBe(testCase.width);
    expect(layout.scrollWidth, `scroll width at ${testCase.width}`).toBe(testCase.width);
    expect(layout.scaleHidden, `time scale visibility at ${testCase.width}`).toBe(testCase.scaleHidden);
    expect(layout.countryOnOwnLine, `country layout at ${testCase.width}`).toBe(true);
    expect(layout.articleFitsViewport, `article width at ${testCase.width}`).toBe(true);
    expect(layout.timeOnRight, `time position at ${testCase.width}`).toBe(true);
    expect(layout.actionsBelowTime, `actions position at ${testCase.width}`).toBe(true);
    expect(layout.scrubberFillsAvailableWidth, `scrubber width at ${testCase.width}`).toBe(true);
    expect(layout.scrubberOnLeft, `scrubber position at ${testCase.width}`).toBe(true);
  }
});

test('non-anchor slider previews datetime and commits URL on change', async ({ page }) => {
  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);
  await addCityBySlug(page, NEW_YORK_SLUG, NEW_YORK_SLUG);

  const slider = cityRow(page, NEW_YORK_SLUG).locator('input[data-action="time-slider"]');
  const currentValue = Number(await slider.inputValue());
  const nextValue = (currentValue + 60) % 1440;

  const beforeDatetime = await displayedDateTime(page);
  const beforeUrl = page.url();

  await setSliderValue(page, NEW_YORK_SLUG, nextValue, 'input');

  await expect.poll(() => displayedDateTime(page)).not.toBe(beforeDatetime);
  await expect.poll(() => page.url()).toBe(beforeUrl);

  await setSliderValue(page, NEW_YORK_SLUG, nextValue, 'change');

  await expect(page).toHaveURL(DEFAULT_COMPARE_URL_PATTERN);
  await expect.poll(() => page.url()).not.toBe(beforeUrl);
});

test('share panel and include datetime toggle keep route preview synchronized', async ({ page }) => {
  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);
  await addCityBySlug(page, NEW_YORK_SLUG, NEW_YORK_SLUG);
  await setDateTime(page, '2026-03-08T09:30');

  await openSharePanel(page);

  const routePreview = page.locator('#route-preview');
  const includeDateToggle = page.locator('#share-include-datetime');
  const noDatePath = `/compare/${MELBOURNE_SLUG}/${NEW_YORK_SLUG}`;

  await expect(routePreview).toHaveValue(page.url());

  await includeDateToggle.setChecked(false);

  await expect(page).toHaveURL(noDatePath);
  await expect(routePreview).toHaveValue(`http://127.0.0.1:4173${noDatePath}`);

  await includeDateToggle.setChecked(true);

  await expect(page).toHaveURL(new RegExp(`${noDatePath}/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}$`));
  await expect(routePreview).toHaveValue(page.url());
});

test('copy button uses clipboard API and shows success state', async ({ page }) => {
  await page.addInitScript(() => {
    const writes = [];

    Object.defineProperty(window, '__clipboardWrites', {
      value: writes,
      writable: false,
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          writes.push(text);
        },
      },
    });
  });

  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);
  await openSharePanel(page);

  const copyButton = page.locator('#copy-link');
  const routePreview = page.locator('#route-preview');
  const expectedUrl = await routePreview.inputValue();

  await expect(copyButton).toBeVisible();
  await copyButton.click();

  await expect(page.locator('#share-message')).toHaveText('Link copied to clipboard.');

  const writes = await page.evaluate(() => window.__clipboardWrites);
  expect(writes).toEqual([expectedUrl]);
});

test('deep link hydrates compared cities and date/time inputs', async ({ page }) => {
  await page.goto('/compare/melbourne-au/new-york-us/2026-03-08T09-30');

  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([MELBOURNE_SLUG, NEW_YORK_SLUG]);
  await expect(page.locator('#date')).toHaveValue('2026-03-08');
  await expect(page.locator('#time')).toHaveValue('09:30');
});

test('back and forward navigation keeps UI and URL synchronized', async ({ page }) => {
  await page.goto('/');

  await addCityBySlug(page, MELBOURNE_SLUG, MELBOURNE_SLUG);
  await addCityBySlug(page, NEW_YORK_SLUG, NEW_YORK_SLUG);

  const twoCityPath = new URL(page.url()).pathname;

  await cityRow(page, NEW_YORK_SLUG).locator('button[data-action="remove"]').click();
  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([MELBOURNE_SLUG]);
  const oneCityPath = new URL(page.url()).pathname;

  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(twoCityPath);
  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([MELBOURNE_SLUG, NEW_YORK_SLUG]);

  await page.goForward();
  await expect.poll(() => new URL(page.url()).pathname).toBe(oneCityPath);
  await expect.poll(() => getOrderedCitySlugs(page)).toEqual([MELBOURNE_SLUG]);
});
