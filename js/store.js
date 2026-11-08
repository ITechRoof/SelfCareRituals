import { dateKey, parseKey } from './util.js';
import { isRetinalDay } from './plan.js';

const KEY = 'skin-ritual:v1';

const DEFAULTS = {
  setupDone: false,
  settings: {
    gymDays: [1, 2, 3, 4, 5],
    eveningHour: 16,
    seasonMode: 'auto', // auto | summer | winter
    summerThreshold: 18, // °C forecast high at or above this = summer care
    location: null, // { lat, lon, name }
    apiKey: '',
    model: 'claude-sonnet-5-5',
    vapidPublicKey: '',
    waits: {}, // stepId -> { summer, winter } seconds, overrides plan.js
    times: { pre: '07:15', post: '10:30', pm: '21:30', photoDay: 0, photoTime: '10:00' },
  },
  logs: [], // { id, date, routine, slot, season, startedAt, finishedAt, skipped, swaps }
  notes: {}, // weekStartKey -> text
  chat: [], // { role, content }
  weather: null, // cached forecast
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return structuredClone(DEFAULTS);
    return {
      ...structuredClone(DEFAULTS),
      ...raw,
      settings: {
        ...DEFAULTS.settings,
        ...raw.settings,
        times: { ...DEFAULTS.settings.times, ...(raw.settings?.times || {}) },
        waits: { ...(raw.settings?.waits || {}) },
      },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const state = load();

// Can this browser keep data between visits?
export const storageWorks = (() => {
  try {
    localStorage.setItem('skin-ritual:probe', '1');
    localStorage.removeItem('skin-ritual:probe');
    return true;
  } catch {
    return false;
  }
})();

// Ask the browser not to clear our data when space is low.
navigator.storage?.persist?.().catch(() => {});

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Could not save', e);
    document.dispatchEvent(new CustomEvent('storage-failed'));
  }
}

export function resetAll() {
  localStorage.removeItem(KEY);
}

export function addLog(entry) {
  state.logs.push({ id: crypto.randomUUID(), ...entry });
  save();
}

export const logsOn = (key) => state.logs.filter((l) => l.date === key);
export const todaysLogs = () => logsOn(dateKey());

export function countsByDate() {
  const m = new Map();
  for (const l of state.logs) m.set(l.date, (m.get(l.date) || 0) + 1);
  return m;
}

// Morning counts when the main (post-gym) routine is done.
// Evening counts when the retinal or rest night routine is done.
export function dayStatus(key) {
  const l = logsOn(key);
  const pm = l.find((x) => x.slot === 'pm');
  return {
    pre: l.some((x) => x.routine === 'preGym'),
    am: l.some((x) => x.routine === 'postGym'),
    pm: pm ? pm.routine : null,
  };
}

function runLength(test) {
  const d = new Date();
  if (!test(dayStatus(dateKey(d)))) d.setDate(d.getDate() - 1); // today can still be finished
  let n = 0;
  while (test(dayStatus(dateKey(d)))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function streaks() {
  return {
    full: runLength((s) => s.am && !!s.pm),
    am: runLength((s) => s.am),
    pm: runLength((s) => !!s.pm),
  };
}
export const streak = () => streaks().full;

// Count of the last `days` days (including today) with morning / evening done.
export function completion(days = 30) {
  let am = 0, pm = 0;
  const d = new Date();
  for (let i = 0; i < days; i++) {
    const s = dayStatus(dateKey(d));
    if (s.am) am++;
    if (s.pm) pm++;
    d.setDate(d.getDate() - 1);
  }
  return { am, pm, days };
}

// Tick or untick a slot by hand, for routines done without the app.
// slot: 'pre' | 'am' | 'pm'
export function setSlotDone(key, slot, done) {
  const match = (l) =>
    l.date === key && (slot === 'pm' ? l.slot === 'pm' : l.routine === (slot === 'pre' ? 'preGym' : 'postGym'));
  if (!done) {
    state.logs = state.logs.filter((l) => !match(l));
    return save();
  }
  if (state.logs.some(match)) return;
  const d = parseKey(key);
  const routine = slot === 'pre' ? 'preGym' : slot === 'am' ? 'postGym' : isRetinalDay(d) ? 'retinal' : 'rest';
  const hour = slot === 'pre' ? 7.5 : slot === 'am' ? 10.5 : 21.5;
  const ts = d.getTime() + hour * 3600000;
  addLog({ date: key, routine, slot: slot === 'pm' ? 'pm' : 'am', season: null, startedAt: ts, finishedAt: ts, manual: true, skipped: [], swaps: [] });
}

// ---------- Photos (IndexedDB) ----------
let dbp;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('skin-ritual-photos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('photos', mode);
    const store = t.objectStore('photos');
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const putPhoto = (p) => tx('readwrite', (s) => s.put(p));
export const deletePhoto = (id) => tx('readwrite', (s) => s.delete(id));
export async function allPhotos() {
  const list = await tx('readonly', (s) => s.getAll());
  return (list || []).sort((a, b) => a.takenAt - b.takenAt);
}
