const { expect } = require('@playwright/test');

const SEARCH_RESULTS = '#search-results';

function cityRow(page, slug) {
  return page.locator(`#cities .city-row[data-slug="${slug}"]`);
}

async function displayedDateTime(page) {
  const date = await page.locator('#date').inputValue();
  const time = await page.locator('#time').inputValue();
  return `${date}T${time}`;
}

async function addCityBySlug(page, slug, query) {
  await expect(page.locator('#date')).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  await expect(page.locator('#time')).toHaveValue(/\d{2}:\d{2}/);

  const searchInput = page.locator('#city-search');
  await searchInput.fill(query);

  const option = page.locator(`${SEARCH_RESULTS} button[data-slug="${slug}"]`);
  await expect(option).toHaveCount(1);
  await searchInput.press('Enter');

  await expect(cityRow(page, slug)).toBeVisible();
}

async function openSharePanel(page) {
  const toggle = page.locator('#share-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#share-panel')).toBeVisible();
}

async function closeSharePanel(page) {
  const toggle = page.locator('#share-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'false') {
    await toggle.click();
  }

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#share-panel')).toBeHidden();
}

async function setDateTime(page, value) {
  const [date, time] = value.split('T');
  const dateInput = page.locator('#date');
  const timeInput = page.locator('#time');

  await dateInput.fill(date);
  await dateInput.dispatchEvent('change');
  await timeInput.fill(time);
  await timeInput.dispatchEvent('change');

  await expect(dateInput).toHaveValue(date);
  await expect(timeInput).toHaveValue(time);
  await expect.poll(() => displayedDateTime(page)).toBe(value);
}

async function getOrderedCitySlugs(page) {
  return page.locator('#cities .city-row').evaluateAll((rows) => rows.map((row) => row.dataset.slug || ''));
}

async function setSliderValue(page, slug, value, eventName) {
  const slider = cityRow(page, slug).locator('input[data-action="time-slider"]');
  await expect(slider).toBeVisible();
  await slider.evaluate(
    (element, payload) => {
      element.value = String(payload.value);
      element.dispatchEvent(new Event(payload.eventName, { bubbles: true }));
    },
    { value, eventName },
  );
}

module.exports = {
  addCityBySlug,
  cityRow,
  closeSharePanel,
  displayedDateTime,
  getOrderedCitySlugs,
  openSharePanel,
  setDateTime,
  setSliderValue,
};
