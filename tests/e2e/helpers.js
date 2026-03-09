const { expect } = require('@playwright/test');

const SEARCH_RESULTS = '#search-results';

function cityRow(page, slug) {
  return page.locator(`#cities .city-row[data-slug="${slug}"]`);
}

async function addCityBySlug(page, slug, query) {
  await expect(page.locator('#datetime')).toHaveValue(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

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
  const dateTimeInput = page.locator('#datetime');
  await dateTimeInput.fill(value);
  await dateTimeInput.dispatchEvent('change');
  await expect(dateTimeInput).toHaveValue(value);
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
  getOrderedCitySlugs,
  openSharePanel,
  setDateTime,
  setSliderValue,
};
