import { state, save } from './store.js';

const FRESH_MS = 2 * 60 * 60 * 1000;

async function fetchForecast({ lat, lon }) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const j = await res.json();
  return {
    at: Date.now(),
    lat,
    lon,
    temp: Math.round(j.current.temperature_2m),
    humidity: Math.round(j.current.relative_humidity_2m),
    max: Math.round(j.daily.temperature_2m_max[0]),
    min: Math.round(j.daily.temperature_2m_min[0]),
    uv: Math.round(j.daily.uv_index_max[0] ?? 0),
  };
}

// Returns { season, source, weather }
export async function getConditions({ force = false } = {}) {
  const s = state.settings;
  let weather = null;

  if (s.location) {
    const c = state.weather;
    const fresh = c && c.lat === s.location.lat && c.lon === s.location.lon && Date.now() - c.at < FRESH_MS;
    if (fresh && !force) weather = c;
    else {
      try {
        weather = await fetchForecast(s.location);
        state.weather = weather;
        save();
      } catch {
        weather = c || null; // fall back to last known
      }
    }
  }

  let season, source;
  if (s.seasonMode !== 'auto') {
    season = s.seasonMode;
    source = 'manual';
  } else if (weather) {
    season = weather.max >= s.summerThreshold ? 'summer' : 'winter';
    source = 'forecast';
  } else {
    const m = new Date().getMonth();
    season = m >= 4 && m <= 8 ? 'summer' : 'winter';
    source = 'month';
  }
  return { season, source, weather };
}

export function describeConditions(c) {
  const care = c.season === 'summer' ? 'Summer care' : 'Winter care';
  if (c.source === 'manual') return `${care}, set manually`;
  if (c.source === 'forecast' && c.weather) {
    return `${care}: today's high is ${c.weather.max}°C`;
  }
  return `${care}, based on the time of year`;
}

export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: +p.coords.latitude.toFixed(3),
          lon: +p.coords.longitude.toFixed(3),
          name: 'Current location',
        }),
      () => reject(new Error('Location permission was refused. Search for your town instead.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 }
    );
  });
}

export async function searchPlace(q) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`
  );
  const j = await res.json();
  return (j.results || []).map((r) => ({
    lat: +r.latitude.toFixed(3),
    lon: +r.longitude.toFixed(3),
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
  }));
}
