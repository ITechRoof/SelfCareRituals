import { state, save, todaysLogs, streak, allPhotos, putPhoto, resetAll, storageWorks } from './store.js';
import { ROUTINES, resolveSteps, suggestRoutine, routineLabel, isRetinalDay, setPlan } from './plan.js';
import { autoUnlock, unlock, lockNow, MissingPlanError } from './lock.js';
import { getConditions, describeConditions, locateMe, searchPlace } from './weather.js';
import { openRunner } from './runner.js';
import { renderProgress } from './progress.js';
import { renderPhotos, setPhotoArea, sheet, closeSheet } from './photos.js';
import { renderAsk } from './ask.js';
import { $, $$, esc, toast, download, fmtClock, fmtDur, dateKey, DAY_SHORT, DAY_LONG, MONTH_SHORT } from './util.js';

const VIEWS = { today: renderToday, progress: renderProgress, photos: renderPhotos, ask: renderAsk, settings: renderSettings };

let unlocked = false;

function route() {
  if (!unlocked) return;
  const tab = (location.hash.slice(1) || 'today').split('?')[0];
  const name = VIEWS[tab] ? tab : 'today';
  $$('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.tab === name ? 'page' : 'false'));
  const view = $('#view');
  view.innerHTML = '';
  window.scrollTo(0, 0);
  VIEWS[name](view);
}

// ---------------- Today ----------------
async function renderToday(el) {
  const now = new Date();
  const s = state.settings;
  const logs = todaysLogs();
  const due = suggestRoutine(now, s, logs);
  const slot = ROUTINES[due].slot;
  const amLogs = logs.filter((l) => l.slot === 'am');
  const pmLogs = logs.filter((l) => l.slot === 'pm');
  const slotDone = slot === 'am' ? amLogs.some((l) => l.routine === 'postGym') : pmLogs.length > 0;
  const n = streak();

  const headline = slot === 'am' ? 'Morning.' : 'Evening.';
  const sub = slotDone
    ? slot === 'am'
      ? 'Morning routine done. See you this evening.'
      : 'Tonight’s routine is done. Sleep well.'
    : `${routineLabel(due, now, s)} is next.`;

  const conditions = await getConditions();
  const steps = resolveSteps(due, conditions.season, {}, s.waits);
  const pmDue = isRetinalDay(now) ? 'retinal' : 'rest';

  const pmRoutine = pmLogs[0]?.routine || pmDue;
  const tile = (label, done, scene, what) => `
    <div class="slot-tile ${done ? 'is-done' : ''}" data-scene="${scene}">
      <span class="tick ${done ? 'on' : ''}" aria-hidden="true"></span>
      <span class="slot-label">${label}</span>
      <span class="slot-what">${esc(what)}</span>
    </div>`;
  const amWhat = amLogs.length
    ? amLogs.map((l) => `${routineLabel(l.routine, now, s)}, ${fmtClock(l.finishedAt)}`).join(', then ')
    : routineLabel('postGym', now, s);
  const pmWhat = pmLogs.length ? `${ROUTINES[pmRoutine].name}, ${fmtClock(pmLogs[0].finishedAt)}` : ROUTINES[pmDue].name;

  el.innerHTML = `
    <section class="scene-card" data-scene="${ROUTINES[due].tone}">
      <svg class="scene-drop" viewBox="0 0 120 140" aria-hidden="true"><path d="M60 4 C60 4 14 58 14 90 A46 46 0 0 0 106 90 C106 58 60 4 60 4 Z"/></svg>
      <div class="hero-top">
        <p class="eyebrow-date">${DAY_LONG[now.getDay()]} ${now.getDate()} ${MONTH_SHORT[now.getMonth()]}</p>
        <button class="weather-chip" aria-label="Weather and season settings">
          <span class="season-dot" data-season="${conditions.season}"></span>
          ${conditions.weather ? `${conditions.weather.temp}°C, ` : ''}${conditions.season === 'summer' ? 'summer care' : 'winter care'}
        </button>
      </div>
      <h1 class="display">${headline}</h1>
      <p class="hero-sub">${esc(sub)}</p>
      <button class="start" data-start>
        <svg viewBox="0 0 120 140" aria-hidden="true"><path d="M60 4 C60 4 14 58 14 90 A46 46 0 0 0 106 90 C106 58 60 4 60 4 Z"/></svg>
        Start routine
      </button>
    </section>

    <section class="panel">
      <div class="panel-head"><h2 class="h2">Today</h2><span class="streak-pill">${n ? `${n}-day streak` : 'No streak yet'}</span></div>
      <div class="slot-tiles">
        ${tile('Morning', amLogs.some((l) => l.routine === 'postGym'), 'sea', amWhat)}
        ${tile('Evening', pmLogs.length > 0, ROUTINES[pmRoutine].tone, pmWhat)}
      </div>
    </section>

    <section class="panel" data-scene-accent="${ROUTINES[due].tone}">
      <h2 class="h2">${esc(routineLabel(due, now, s))} order</h2>
      <ol class="order">${steps
        .map(
          (st) => `<li><span class="order-name">${esc(st.product)}</span><span class="order-meta">${esc(st.portion)}${
            st.wait ? ` <span class="wait-badge">dry ${fmtDur(st.wait)}</span>` : ''
          }</span></li>`
        )
        .join('')}</ol>
      ${
        ROUTINES[due].reminders.length
          ? `<ul class="reminders">${ROUTINES[due].reminders.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
          : ''
      }
      <p class="muted small cond">${esc(describeConditions(conditions))}.</p>
    </section>`;

  el.querySelector('[data-start]').addEventListener('click', startRoutine);
  el.querySelector('.weather-chip').addEventListener('click', () => (location.hash = 'settings'));
}

function startRoutine() {
  openRunner({ onDone: () => route() });
}

// ---------------- Themes ----------------
const PALETTES = [
  { id: 'original', name: 'Twilight', note: 'Peach and aqua mornings, indigo and gold nights',
    sw: [['#FFE4D2', '#FFBFD5'], ['#CFF5EA', '#B9DEFA'], ['#1A1636', '#3E2659'], ['#201C4A', '#4A3A96']] },
  { id: 'pastel', name: 'Soft pastel', note: 'Blush, mint and lilac, light all day',
    sw: [['#FFEAF1', '#FFD3E3'], ['#E2F7EF', '#D8ECFB'], ['#F1EAFF', '#E2D5FF'], ['#EEE8FF', '#DCD2FF']] },
  { id: 'luxe', name: 'Warm luxe', note: 'Rose gold and champagne, cocoa nights',
    sw: [['#FBE8DF', '#F2CFC6'], ['#F7E6E1', '#EACBC4'], ['#2A1D19', '#4A3027'], ['#38261F', '#5D3F35']] },
  { id: 'spa', name: 'Fresh spa', note: 'Sage, clay and sand, forest nights',
    sw: [['#F6EEE3', '#EFDACB'], ['#E7F0E5', '#D3E5DB'], ['#1E2A25', '#2F4037'], ['#21303A', '#33505A']] },
  { id: 'jewel', name: 'Bold jewel', note: 'Ruby, emerald and amethyst',
    sw: [['#FF8A5C', '#D81B60'], ['#00B894', '#0B6E8A'], ['#0E0B2E', '#2B0F5C'], ['#2A1171', '#6A2BD9']] },
];

function applyPalette(id = state.settings.palette || 'original') {
  const root = document.documentElement;
  if (id === 'original') delete root.dataset.palette;
  else root.dataset.palette = id;
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  if (paper) $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', paper));
}

function themePicker() {
  const cur = state.settings.palette || 'original';
  return `<div class="palettes" role="radiogroup" aria-label="Theme">${PALETTES.map(
    (p) => `<label class="palette">
      <input type="radio" name="palette" value="${p.id}" ${p.id === cur ? 'checked' : ''}>
      <span class="pal-swatch" aria-hidden="true">${p.sw.map(([a, b]) => `<i style="background:linear-gradient(160deg,${a},${b})"></i>`).join('')}</span>
      <span class="pal-text"><span class="pal-name">${p.name}</span><span class="pal-note">${p.note}</span></span>
    </label>`
  ).join('')}</div>`;
}

// ---------------- Settings ----------------
function renderSettings(el) {
  const s = state.settings;
  const t = s.times;
  const hours = [...Array(24)].map((_, h) => `<option value="${h}" ${h === s.eveningHour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  const pushSupported = 'PushManager' in window && 'serviceWorker' in navigator;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  el.innerHTML = `
    <section class="hero tight"><h1 class="display">Settings</h1></section>

    <section class="block">
      <h2 class="h2">Theme</h2>
      ${themePicker()}
      <p class="muted small">Light or dark follows your iPhone’s appearance setting.</p>
    </section>

    <section class="block">
      <h2 class="h2">Gym days</h2>
      <p class="muted small">On these days the app suggests the pre-gym routine first. Other days, post-gym is your main morning.</p>
      <div class="days">${[1, 2, 3, 4, 5, 6, 0]
        .map((d) => `<label class="day"><input type="checkbox" value="${d}" ${s.gymDays.includes(d) ? 'checked' : ''} data-gym><span>${DAY_SHORT[d]}</span></label>`)
        .join('')}</div>
      <label class="field">Evening routines start at <select data-evening>${hours}</select></label>
    </section>

    <section class="block">
      <h2 class="h2">Weather and season</h2>
      <div class="seg" role="radiogroup" aria-label="Season">
        ${['auto', 'summer', 'winter']
          .map((m) => `<label><input type="radio" name="season" value="${m}" ${s.seasonMode === m ? 'checked' : ''}><span>${m === 'auto' ? 'From forecast' : m[0].toUpperCase() + m.slice(1)}</span></label>`)
          .join('')}
      </div>
      <label class="field">Use summer care when today’s high is at least
        <span class="inline"><input type="number" inputmode="numeric" min="5" max="35" value="${s.summerThreshold}" data-threshold> °C</span></label>
      <p class="small">Location: <strong>${esc(s.location?.name || 'not set')}</strong>${s.location ? '' : ' <span class="muted">(season follows the month until you set one)</span>'}</p>
      <div class="row-actions">
        <button class="ghost" data-locate>Use my location</button>
      </div>
      <form class="search-row" data-search><input type="search" placeholder="Or search a town" aria-label="Search a town"><button class="ghost" type="submit">Search</button></form>
      <div class="search-results"></div>
    </section>

    <section class="block">
      <h2 class="h2">Drying times</h2>
      <p class="muted small">How long the timer waits after each step before moving on. Set any to Off to skip it.</p>
      ${dryingSettings()}
    </section>

    <section class="block">
      <h2 class="h2">Reminders</h2>
      <div class="times">
        <label class="field">Pre-gym <input type="time" value="${t.pre}" data-time="pre"></label>
        <label class="field">Post-gym <input type="time" value="${t.post}" data-time="post"></label>
        <label class="field">Evening <input type="time" value="${t.pm}" data-time="pm"></label>
        <label class="field">Photos on <select data-photoday>${[0, 1, 2, 3, 4, 5, 6].map((d) => `<option value="${d}" ${d === +t.photoDay ? 'selected' : ''}>${DAY_LONG[d]}</option>`).join('')}</select></label>
        <label class="field">Photos at <input type="time" value="${t.photoTime}" data-time="photoTime"></label>
      </div>
      <p class="muted small">Simplest option: add these as repeating events with alerts to your iPhone calendar. Retinal and rest nights get their own titles.</p>
      <div class="row-actions"><button class="primary" data-ics>Add to Calendar</button></div>

      <details class="advanced">
        <summary>Push notifications from GitHub</summary>
        <p class="small">Real push notifications need a sender. The repo includes a GitHub Action that sends them on the schedule in <code>reminders.json</code>. Setup steps are in the README.</p>
        ${!standalone ? '<p class="small warn">Open the app from your Home Screen to turn on notifications. iPhone only allows them for installed web apps.</p>' : ''}
        ${!pushSupported ? '<p class="small warn">This browser doesn’t support web push.</p>' : ''}
        <label class="field">VAPID public key <input type="text" value="${esc(s.vapidPublicKey)}" data-vapid autocomplete="off" spellcheck="false"></label>
        <div class="row-actions"><button class="ghost" data-push ${pushSupported ? '' : 'disabled'}>Turn on notifications</button></div>
        <div class="push-out"></div>
      </details>
    </section>

    <section class="block">
      <h2 class="h2">AI chat</h2>
      <p class="muted small">Uses your own Anthropic API key, sent straight from this phone to Anthropic. Get one at console.anthropic.com.</p>
      <label class="field">API key <input type="password" value="${esc(s.apiKey)}" data-key autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></label>
      <label class="field">Model <input type="text" value="${esc(s.model)}" data-model autocomplete="off" spellcheck="false"></label>
    </section>

    <section class="block">
      <h2 class="h2">Privacy</h2>
      <p class="muted small">Your routine is stored encrypted and only opens with your passphrase. Lock the app to ask for it again on this phone.</p>
      <div class="row-actions"><button class="ghost" data-lock>Lock now</button></div>
    </section>

    <section class="block">
      <h2 class="h2">Backup</h2>
      <p class="muted small">Your logs, notes and photos live only on this phone. Export a backup now and then.</p>
      <label class="check"><input type="checkbox" data-incphotos> Include photos (bigger file)</label>
      <div class="row-actions">
        <button class="ghost" data-export>Export backup</button>
        <label class="ghost file-btn">Import backup<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
      <div class="row-actions"><button class="ghost danger" data-reset>Erase all data</button></div>
    </section>
    <p class="muted small center">Skin Ritual. Your plan is informational, not medical advice.</p>`;

  const q = (sel) => el.querySelector(sel);
  const commit = (msg) => {
    save();
    if (msg) toast(msg);
  };

  el.querySelectorAll('input[name=palette]').forEach((r) =>
    r.addEventListener('change', () => {
      s.palette = r.value;
      applyPalette(r.value);
      commit();
    })
  );

  el.querySelectorAll('[data-gym]').forEach((c) =>
    c.addEventListener('change', () => {
      s.gymDays = $$('[data-gym]:checked', el).map((x) => +x.value);
      commit();
    })
  );
  q('[data-evening]').addEventListener('change', (e) => ((s.eveningHour = +e.target.value), commit('Saved')));
  el.querySelectorAll('input[name=season]').forEach((r) => r.addEventListener('change', () => ((s.seasonMode = r.value), commit('Saved'))));
  q('[data-threshold]').addEventListener('change', (e) => ((s.summerThreshold = +e.target.value || 18), commit('Saved')));

  q('[data-locate]').addEventListener('click', async () => {
    try {
      s.location = await locateMe();
      state.weather = null;
      commit('Location saved');
      renderSettings(el);
    } catch (err) {
      toast(err.message);
    }
  });
  q('[data-search]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const term = e.target.querySelector('input').value.trim();
    if (!term) return;
    const box = q('.search-results');
    box.innerHTML = '<p class="muted small">Searching…</p>';
    try {
      const res = await searchPlace(term);
      box.innerHTML = res.length
        ? res.map((r, i) => `<button class="link-btn" data-i="${i}">${esc(r.name)}</button>`).join('')
        : '<p class="muted small">No matches. Try a nearby larger town.</p>';
      box.querySelectorAll('[data-i]').forEach((b) =>
        b.addEventListener('click', () => {
          s.location = res[+b.dataset.i];
          state.weather = null;
          commit('Location saved');
          renderSettings(el);
        })
      );
    } catch {
      box.innerHTML = '<p class="muted small">Search needs an internet connection.</p>';
    }
  });

  el.querySelectorAll('[data-time]').forEach((i) => i.addEventListener('change', () => ((t[i.dataset.time] = i.value), commit())));
  q('[data-photoday]').addEventListener('change', (e) => ((t.photoDay = +e.target.value), commit()));
  q('[data-ics]').addEventListener('click', () => download('skin-ritual-reminders.ics', buildIcs(), 'text/calendar'));

  q('[data-vapid]').addEventListener('change', (e) => ((s.vapidPublicKey = e.target.value.trim()), commit()));
  q('[data-push]').addEventListener('click', () => enablePush(q('.push-out')));

  el.querySelectorAll('[data-wait]').forEach((sel) =>
    sel.addEventListener('change', () => {
      const [id, season] = sel.dataset.wait.split(':');
      const v = +sel.value;
      const cur = s.waits[id] || {};
      s.waits[id] = season === 'both' ? { summer: v, winter: v } : { ...defaultWait(id), ...cur, [season]: v };
      commit('Saved');
    })
  );
  q('[data-reset-waits]').addEventListener('click', () => {
    s.waits = {};
    commit('Drying times reset');
    renderSettings(el);
  });

  q('[data-key]').addEventListener('change', (e) => ((s.apiKey = e.target.value.trim()), commit('API key saved')));
  q('[data-model]').addEventListener('change', (e) => ((s.model = e.target.value.trim() || 'claude-sonnet-5-5'), commit('Saved')));

  q('[data-lock]').addEventListener('click', async () => {
    await lockNow();
    location.reload();
  });

  q('[data-export]').addEventListener('click', () => exportBackup(q('[data-incphotos]').checked));
  q('[data-import]').addEventListener('change', (e) => importBackup(e.target.files[0]));
  q('[data-reset]').addEventListener('click', async () => {
    if (!confirm('Erase all logs, notes, chat and settings on this phone? Photos are erased too.')) return;
    resetAll();
    indexedDB.deleteDatabase('skin-ritual-photos');
    location.reload();
  });
}

// ---------------- Drying times ----------------
const WAIT_OPTIONS = [0, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600];
const waitText = (v) => (v === 0 ? 'Off' : v < 60 ? `${v} s` : v % 60 ? `${Math.floor(v / 60)} min ${v % 60} s` : `${v / 60} min`);

function defaultWait(id) {
  for (const r of Object.values(ROUTINES)) {
    const st = r.steps.find((x) => x.id === id);
    if (st) return { summer: st.wait?.summer ?? 0, winter: st.wait?.winter ?? 0 };
  }
  return { summer: 0, winter: 0 };
}

function dryingSettings() {
  const w = state.settings.waits;
  const select = (key, value) =>
    `<select data-wait="${key}" aria-label="Drying time">${WAIT_OPTIONS.concat(WAIT_OPTIONS.includes(value) ? [] : [value])
      .sort((a, b) => a - b)
      .map((v) => `<option value="${v}" ${v === value ? 'selected' : ''}>${waitText(v)}</option>`)
      .join('')}</select>`;
  return ['preGym', 'postGym', 'retinal', 'rest']
    .map((rid) => {
      const r = ROUTINES[rid];
      const rows = r.steps
        .filter((st) => st.id !== 'post-body-spf')
        .slice(0, -1) // no wait needed after the last step
        .map((st) => {
          const d = defaultWait(st.id);
          const cur = { ...d, ...(w[st.id] || {}) };
          const seasonal = d.summer !== d.winter || cur.summer !== cur.winter;
          return `<div class="dry-row"><span>${esc(st.product)}</span>${
            seasonal
              ? `<span class="dry-pair"><label>Summer ${select(`${st.id}:summer`, cur.summer)}</label><label>Winter ${select(`${st.id}:winter`, cur.winter)}</label></span>`
              : select(`${st.id}:both`, cur.summer)
          }</div>`;
        })
        .join('');
      return `<details class="dry-group" data-scene="${r.tone}"><summary>${esc(r.name)}</summary>${rows}</details>`;
    })
    .join('') + '<div class="row-actions"><button class="ghost" data-reset-waits>Reset to suggested times</button></div>';
}

// ---------------- Calendar reminders (.ics) ----------------
function buildIcs() {
  const t = state.settings.times;
  const today = new Date();
  const ymd = dateKey(today).replaceAll('-', '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ev = (uid, title, time, rrule, desc) => {
    const [h, m] = time.split(':');
    return [
      'BEGIN:VEVENT',
      `UID:${uid}@skin-ritual`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${ymd}T${h}${m}00`,
      'DURATION:PT20M',
      `RRULE:${rrule}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${title}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  };
  const gym = state.settings.gymDays.map((d) => BY[d]).join(',');
  const order = (id) => ROUTINES[id].steps.map((st) => st.product).join(', then ');
  const events = [
    gym && ev('pre-gym', 'Pre-gym skincare', t.pre, `FREQ=WEEKLY;BYDAY=${gym}`, order('preGym')),
    ev('post-gym', 'Morning skincare', t.post, 'FREQ=DAILY', order('postGym')),
    ev('retinal', ROUTINES.retinal.name, t.pm, 'FREQ=WEEKLY;BYDAY=MO,TH', order('retinal')),
    ev('rest', ROUTINES.rest.name, t.pm, 'FREQ=WEEKLY;BYDAY=TU,WE,FR,SA,SU', order('rest')),
    ev('photos', 'Progress photos', t.photoTime, `FREQ=WEEKLY;BYDAY=${BY[+t.photoDay]}`, 'Same light, same angle.'),
  ].filter(Boolean);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Skin Ritual//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}

// ---------------- Web push ----------------
function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function enablePush(out) {
  const key = state.settings.vapidPublicKey;
  if (!key) return toast('Paste your VAPID public key first.');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications were not allowed.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && state.settings.pushKeyUsed !== key) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    state.settings.pushKeyUsed = key;
    save();
    const json = JSON.stringify(sub);
    out.innerHTML = `<p class="small">Notifications are on. Copy this and save it as the <code>PUSH_SUBSCRIPTION</code> secret in your GitHub repo.</p>
      <textarea class="mono-box" rows="5" readonly>${esc(json)}</textarea>
      <div class="row-actions"><button class="ghost" data-copy>Copy</button></div>`;
    out.querySelector('[data-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(json);
        toast('Copied');
      } catch {
        out.querySelector('textarea').select();
      }
    });
  } catch (err) {
    toast(`Couldn’t turn on notifications: ${err.message}`);
  }
}

// ---------------- Backup ----------------
const blobToDataUrl = (b) =>
  new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(b);
  });

async function exportBackup(includePhotos) {
  const { apiKey, ...settings } = state.settings;
  const data = { app: 'skin-ritual', version: 1, exportedAt: new Date().toISOString(), settings, logs: state.logs, notes: state.notes };
  if (includePhotos) {
    const photos = await allPhotos();
    data.photos = await Promise.all(photos.map(async ({ blob, ...p }) => ({ ...p, data: await blobToDataUrl(blob) })));
  }
  download(`skin-ritual-backup-${dateKey()}.json`, JSON.stringify(data));
}

async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'skin-ritual') throw new Error('not a Skin Ritual backup');
    const ids = new Set(state.logs.map((l) => l.id));
    state.logs.push(...(data.logs || []).filter((l) => !ids.has(l.id)));
    state.notes = { ...data.notes, ...state.notes };
    state.settings = { ...state.settings, ...data.settings, apiKey: state.settings.apiKey };
    save();
    for (const p of data.photos || []) {
      const blob = await (await fetch(p.data)).blob();
      const { data: _, ...rest } = p;
      await putPhoto({ ...rest, blob });
    }
    toast('Backup imported');
    route();
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
}

// ---------------- First-run setup ----------------
function firstRun() {
  const s = state.settings;
  const card = sheet(`
    <header class="sheet-head"><h2 class="display small-display">Welcome</h2></header>
    <p>Two things make the guidance fit your day.</p>
    <h3 class="h2">Which days do you go to the gym?</h3>
    <div class="days">${[1, 2, 3, 4, 5, 6, 0]
      .map((d) => `<label class="day"><input type="checkbox" value="${d}" ${s.gymDays.includes(d) ? 'checked' : ''}><span>${DAY_SHORT[d]}</span></label>`)
      .join('')}</div>
    <h3 class="h2">Where are you, for the weather?</h3>
    <p class="muted small">The forecast decides summer or winter portions. Without it, the app goes by the month.</p>
    <div class="row-actions"><button class="ghost" data-loc>Use my location</button><span class="loc-state muted small"></span></div>
    <div class="row-actions"><button class="primary" data-done>Start using Skin Ritual</button></div>`);
  card.querySelector('[data-loc]').addEventListener('click', async () => {
    try {
      s.location = await locateMe();
      card.querySelector('.loc-state').textContent = 'Location saved.';
    } catch (err) {
      card.querySelector('.loc-state').textContent = err.message;
    }
  });
  card.querySelector('[data-done]').addEventListener('click', () => {
    s.gymDays = $$('.days input:checked', card).map((x) => +x.value);
    state.setupDone = true;
    save();
    closeSheet();
    route();
  });
}

// ---------------- Boot ----------------
$$('.tab').forEach((t) => t.addEventListener('click', () => (location.hash = t.dataset.tab)));
window.addEventListener('hashchange', route);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

const params = new URLSearchParams(location.search);
if (params.get('tab') === 'photos') location.hash = 'photos';
if (params.get('area')) setPhotoArea(params.get('area'));
if (params.toString()) history.replaceState(null, '', location.pathname + location.hash);

const DROP_PATH = 'M60 4 C60 4 14 58 14 90 A46 46 0 0 0 106 90 C106 58 60 4 60 4 Z';

function storageWarning() {
  if ($('#storage-warning')) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const el = document.createElement('div');
  el.id = 'storage-warning';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<strong>This browser isn’t saving your data.</strong>
    Your setup and routines will be forgotten when you close it.
    ${standalone ? '' : 'Open Skin Ritual from its Home Screen icon, not a Safari tab. '}
    Check you’re not in Private Browsing, and that Settings → Safari → Advanced → Block All Cookies is off.`;
  document.body.prepend(el);
}
document.addEventListener('storage-failed', storageWarning);

function start(plan) {
  setPlan(plan);
  if (!storageWorks) storageWarning();
  unlocked = true;
  document.body.classList.remove('locked');
  $('#lock')?.remove();
  route();
  if (!state.setupDone) firstRun();
  else if (params.get('start') === '1') startRoutine();
}

function showLock(message = '') {
  document.body.classList.add('locked');
  const el = document.createElement('div');
  el.id = 'lock';
  el.className = 'lock';
  el.dataset.scene = 'dusk';
  el.innerHTML = `
    <form class="lock-card" autocomplete="on">
      <svg class="lock-drop" viewBox="0 0 120 140" aria-hidden="true"><path d="${DROP_PATH}"/></svg>
      <h1 class="display">Skin Ritual</h1>
      <p class="lock-sub">Enter your passphrase to open your routine.</p>
      <input class="visually-hidden" type="text" name="username" autocomplete="username" value="Skin Ritual" tabindex="-1" aria-hidden="true">
      <label class="visually-hidden" for="pass">Passphrase</label>
      <input id="pass" name="password" type="password" autocomplete="current-password" placeholder="Passphrase" required>
      <label class="check"><input type="checkbox" data-remember checked> Stay unlocked on this phone</label>
      <button class="start" type="submit"><svg viewBox="0 0 120 140" aria-hidden="true"><path d="${DROP_PATH}"/></svg>Unlock</button>
      <p class="lock-err" role="alert">${message}</p>
    </form>`;
  document.body.appendChild(el);
  const form = el.querySelector('form');
  const input = el.querySelector('#pass');
  const err = el.querySelector('.lock-err');
  const btn = el.querySelector('button[type=submit]');
  input.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    btn.lastChild.textContent = 'Unlocking…';
    try {
      const plan = await unlock(input.value, el.querySelector('[data-remember]').checked);
      start(plan);
    } catch (ex) {
      btn.disabled = false;
      btn.lastChild.textContent = 'Unlock';
      err.textContent =
        ex.message === 'wrong'
          ? 'That passphrase didn’t work. Try again.'
          : ex instanceof MissingPlanError
            ? 'No encrypted routine has been uploaded yet. Run node tools/encrypt-plan.mjs and push plan.enc.json.'
            : 'Couldn’t load your routine. Check your connection and try again.';
      input.select();
    }
  });
}

applyPalette();

(async () => {
  try {
    const plan = await autoUnlock();
    if (plan) return start(plan);
    showLock();
  } catch (e) {
    showLock(
      e instanceof MissingPlanError
        ? 'No encrypted routine has been uploaded yet. Run node tools/encrypt-plan.mjs and push plan.enc.json.'
        : ''
    );
  }
})();
