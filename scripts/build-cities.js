const fs = require('fs');
const path = require('path');
const cityTimezones = require('city-timezones');

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function uniqueSlug(baseParts, fallbackParts, seen) {
  const base = baseParts.filter(Boolean).join('-');
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }

  const fallback = [...baseParts, ...fallbackParts].filter(Boolean).join('-');
  if (!seen.has(fallback)) {
    seen.add(fallback);
    return fallback;
  }

  let idx = 2;
  while (seen.has(`${fallback}-${idx}`)) {
    idx += 1;
  }

  const finalSlug = `${fallback}-${idx}`;
  seen.add(finalSlug);
  return finalSlug;
}

const rows = cityTimezones.cityMapping
  .filter((row) => row.city && row.iso2 && row.timezone)
  .map((row) => ({
    city: row.city,
    cityAscii: row.city_ascii || row.city,
    country: row.country,
    countryCode: String(row.iso2).toUpperCase(),
    province: row.province || '',
    timeZone: row.timezone,
    population: Number(row.pop || 0),
  }))
  .sort((a, b) => b.population - a.population || a.cityAscii.localeCompare(b.cityAscii));

const seen = new Set();
const output = rows.map((row) => {
  const citySlug = slugify(row.cityAscii);
  const countrySlug = slugify(row.countryCode);
  const provinceSlug = slugify(row.province);
  const tzSlug = slugify(row.timeZone.replace(/\//g, '-'));

  const slug = uniqueSlug([citySlug, countrySlug], [provinceSlug, tzSlug], seen);
  const aliases = [row.city, row.cityAscii].filter((v, i, arr) => v && arr.indexOf(v) === i);

  return {
    slug,
    name: row.city,
    country: row.country,
    countryCode: row.countryCode,
    timeZone: row.timeZone,
    aliases,
    population: row.population,
  };
});

const outPath = path.join(__dirname, '..', 'public', 'data', 'cities.json');
fs.writeFileSync(outPath, JSON.stringify(output));
console.log(`Wrote ${output.length} cities to ${outPath}`);
