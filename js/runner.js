import { ROUTINES, resolveSteps, suggestRoutine, routineLabel, isRetinalDay } from './plan.js';
import { state, addLog, todaysLogs, streak, dayStatus } from './store.js';
import { getConditions, describeConditions } from './weather.js';
import { $, esc, dateKey, dayKey, skinDate, fmtDur } from './util.js';
import { checkin } from './nudge.js';

const DROP = 'M60 4 C60 4 14 58 14 90 A46 46 0 0 0 106 90 C106 58 60 4 60 4 Z';

let run = null;
let tick = null;
let wakeLock = null;
let audio = null;

const root = () => $('#runner');

function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {}
}

function chime() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    const t = t0 + i * 0.16;
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.75);
  });
  navigator.vibrate?.([120, 80, 120]);
}

async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run) {
    keepAwake(true);
    if (run.phase === 'wait') renderWait();
  }
});

export async function openRunner({ routine = null, onDone } = {}) {
  const now = new Date();
  const conditions = await getConditions();
  const suggested = suggestRoutine(now, state.settings, todaysLogs());
  run = {
    routine: routine || suggested,
    suggested,
    conditions,
    phase: routine ? 'intro' : ROUTINES[suggested].slot === 'am' ? 'choose' : 'intro',
    index: 0,
    swaps: {},
    skipped: [],
    timeline: {},
    startedAt: Date.now(),
    onDone,
  };
  const el = root();
  el.hidden = false;
  document.body.classList.add('running');
  keepAwake(true);
  render();
}

function close() {
  clearInterval(tick);
  keepAwake(false);
  const done = run?.phase === 'done';
  const cb = run?.onDone;
  run = null;
  root().hidden = true;
  root().innerHTML = '';
  document.body.classList.remove('running');
  if (done) cb?.();
  else cb?.(false);
}

function confirmClose() {
  if (!run || run.phase === 'choose' || run.phase === 'intro' || run.phase === 'done') return close();
  if (confirm('Leave this routine? It won’t be logged.')) close();
}

function steps() {
  return resolveSteps(run.routine, run.conditions.season, run.swaps, state.settings.waits);
}

function render() {
  clearInterval(tick);
  const el = root();
  el.dataset.scene = ROUTINES[run.routine].tone;
  ({ choose: renderChoose, intro: renderIntro, step: renderStep, wait: renderWait, done: renderDone })[run.phase]();
  el.querySelector('[data-close]')?.addEventListener('click', confirmClose);
  el.querySelector('.runner-body')?.focus({ preventScroll: true });
}

function header(right = '') {
  return `<header class="runner-head">
    <button class="icon-btn" data-close aria-label="Close routine">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <span class="runner-count">${right}</span>
  </header>`;
}

function renderChoose() {
  const now = new Date();
  const gymDay = state.settings.gymDays.includes(now.getDay());
  const doneIds = todaysLogs().map((l) => l.routine);
  const opt = (id, sub) => {
    const r = ROUTINES[id];
    const rec = id === run.suggested;
    const did = doneIds.includes(id);
    return `<button class="choice" data-pick="${id}" data-scene="${r.tone}">
      <span class="choice-name">${esc(routineLabel(id, now, state.settings))}</span>
      <span class="choice-sub">${esc(sub)}${did ? ' Already done today.' : ''}</span>
      ${rec ? '<span class="choice-tag">Suggested now</span>' : ''}
    </button>`;
  };
  root().innerHTML = `${header()}
    <div class="runner-body" tabindex="-1">
      <h1 class="runner-title">Gym or post-gym?</h1>
      <p class="runner-lede">${gymDay ? 'It’s a gym day.' : 'No gym today, so post-gym is your main morning routine.'}</p>
      <div class="choices">
        ${opt('preGym', 'Rinse and sunscreen before the school drop.')}
        ${opt('postGym', gymDay ? 'Full routine after your bath.' : 'Your full morning routine.')}
      </div>
      <button class="link-btn" data-evening>It’s actually evening</button>
    </div>`;
  root().querySelectorAll('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      run.routine = b.dataset.pick;
      run.phase = 'intro';
      render();
    })
  );
  root().querySelector('[data-evening]').addEventListener('click', () => {
    run.routine = isRetinalDay() ? 'retinal' : 'rest';
    run.phase = 'intro';
    render();
  });
}

function renderIntro() {
  const r = ROUTINES[run.routine];
  const list = steps();
  const waitSecs = list.reduce((a, s) => a + s.wait, 0);
  const c = run.conditions;
  const w = c.weather;
  const other =
    r.slot === 'pm'
      ? run.routine === 'retinal'
        ? ['rest', 'Switch to rest night']
        : ['retinal', 'Switch to retinal night']
      : null;
  root().innerHTML = `${header()}
    <div class="runner-body" tabindex="-1">
      <h1 class="runner-title">${esc(routineLabel(run.routine, skinDate(), state.settings))}</h1>
      <p class="runner-lede">${list.length} steps${waitSecs ? `, with ${dur(waitSecs)} of drying time between them` : ''}.</p>
      <div class="season-line">
        <span class="season-dot" data-season="${c.season}"></span>
        <span>${esc(describeConditions(c))}${w ? `. Now ${w.temp}°C, humidity ${w.humidity}%, UV up to ${w.uv}.` : '.'}</span>
      </div>
      ${
        r.reminders.length
          ? `<ul class="reminders">${r.reminders.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
          : ''
      }
      <ol class="step-preview">${list.map((s) => `<li><span>${esc(s.product)}</span>${s.wait ? `<span class="wait-badge">dry ${fmtDur(s.wait)}</span>` : ''}</li>`).join('')}</ol>
      ${other ? `<button class="link-btn" data-switch="${other[0]}">${other[1]}</button>` : ''}
      ${r.slot === 'am' ? '<button class="link-btn" data-back-choose>Choose a different morning routine</button>' : ''}
    </div>
    <footer class="runner-foot"><button class="primary" data-begin>Begin</button></footer>`;
  root().querySelector('[data-begin]').addEventListener('click', () => {
    unlockAudio();
    run.startedAt = Date.now();
    run.phase = 'step';
    run.index = 0;
    render();
  });
  root().querySelector('[data-switch]')?.addEventListener('click', (e) => {
    run.routine = e.currentTarget.dataset.switch;
    render();
  });
  root().querySelector('[data-back-choose]')?.addEventListener('click', () => {
    run.phase = 'choose';
    render();
  });
}

function progressBar(list) {
  return `<div class="segments" aria-hidden="true">${list
    .map((_, i) => `<span class="${i < run.index ? 'done' : i === run.index ? 'now' : ''}"></span>`)
    .join('')}</div>`;
}

function renderStep() {
  const list = steps();
  const s = list[run.index];
  mark(s.id).startedAt ??= Date.now();
  root().innerHTML = `${header(`Step ${run.index + 1} of ${list.length}`)}
    ${progressBar(list)}
    <div class="runner-body step" tabindex="-1">
      <p class="step-area">${esc(s.area)}</p>
      <h1 class="step-product">${esc(s.product)}</h1>
      <p class="portion"><span>Use</span> ${esc(s.portion)}</p>
      <p class="step-how">${esc(s.how)}</p>
      ${s.note ? `<p class="step-note">${esc(s.note)}</p>` : ''}
      ${s.alt ? `<button class="link-btn" data-swap>${esc(s.alt.reason)} Use ${esc(s.alt.product)} instead</button>` : ''}
      ${s.swapped ? '<p class="step-note">Swapped for today.</p>' : ''}
      ${s.wait ? `<p class="dry-hint"><span class="wait-badge">dry ${fmtDur(s.wait)}</span> A timer starts when you tap Done.</p>` : ''}
    </div>
    <footer class="runner-foot">
      <button class="ghost" data-prev ${run.index === 0 ? 'disabled' : ''}>Back</button>
      <button class="ghost" data-skip>Skip</button>
      <button class="primary" data-next>${s.wait ? `Done, dry ${fmtDur(s.wait)}` : 'Done'}</button>
    </footer>`;
  const q = (sel) => root().querySelector(sel);
  q('[data-next]').addEventListener('click', () => {
    unlockAudio();
    const t = mark(s.id);
    t.doneAt = Date.now();
    delete t.skipped;
    if (s.wait) {
      t.waitPlannedSec = s.wait;
      t.waitStartedAt = Date.now();
      t.waitAddedSec = 0;
      run.phase = 'wait';
      run.waitTotal = s.wait;
      run.waitEnd = Date.now() + s.wait * 1000;
      run.chimed = false;
      render();
    } else advance();
  });
  q('[data-skip]').addEventListener('click', () => {
    run.skipped.push(s.id);
    Object.assign(mark(s.id), { skipped: true, doneAt: Date.now() });
    advance();
  });
  q('[data-prev]').addEventListener('click', () => {
    run.index = Math.max(0, run.index - 1);
    render();
  });
  q('[data-swap]')?.addEventListener('click', () => {
    run.swaps[s.id] = true;
    render();
  });
}

// Per-step timeline for later analysis (not shown to the user).
function mark(stepId) {
  return (run.timeline[stepId] ??= {});
}

function endWait() {
  const s = steps()[run.index];
  const t = mark(s.id);
  const now = Date.now();
  t.waitEndedAt = now;
  t.waitedSec = Math.round((now - t.waitStartedAt) / 1000);
  t.waitCutShort = now < run.waitEnd - 1000; // tapped Skip wait before the timer ran out
  clearInterval(tick);
  advance();
}

function advance() {
  const list = steps();
  if (run.index + 1 >= list.length) return finish();
  run.index++;
  run.phase = 'step';
  render();
}

function renderWait() {
  const list = steps();
  const s = list[run.index];
  const next = list[run.index + 1];
  root().innerHTML = `${header(`Step ${run.index + 1} of ${list.length}`)}
    ${progressBar(list)}
    <div class="runner-body wait" tabindex="-1">
      <p class="wait-label">${esc(s.waitLabel)}</p>
      <svg class="drop" viewBox="0 0 120 140" role="img" aria-label="Drying timer">
        <defs><clipPath id="dropclip"><path d="${DROP}"/></clipPath></defs>
        <path d="${DROP}" class="drop-shell"/>
        <g clip-path="url(#dropclip)">
          <rect class="drop-liquid" x="0" y="0" width="120" height="140"/>
          <path class="drop-wave" d=""/>
        </g>
        <path d="${DROP}" class="drop-outline"/>
      </svg>
      <p class="wait-time" aria-live="off">0:00</p>
      <p class="wait-next">${next ? `Then: ${esc(next.product)}` : 'Then you’re done.'}</p>
      <p class="wait-auto">Moves on by itself when the time is up.</p>
    </div>
    <footer class="runner-foot">
      <button class="ghost" data-more>+1 min</button>
      <button class="primary" data-go>Skip wait</button>
    </footer>`;
  const liquid = root().querySelector('.drop-liquid');
  const wave = root().querySelector('.drop-wave');
  const time = root().querySelector('.wait-time');
  const go = root().querySelector('[data-go]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const update = () => {
    const left = (run.waitEnd - Date.now()) / 1000;
    const frac = Math.max(0, Math.min(1, left / run.waitTotal));
    const top = 6 + (1 - frac) * 130;
    liquid.setAttribute('y', top);
    if (!reduce && frac > 0) {
      const ph = (Date.now() / 600) % (Math.PI * 2);
      let d = `M0 ${top}`;
      for (let x = 0; x <= 120; x += 6) d += ` L${x} ${top + Math.sin(x / 14 + ph) * 2.2}`;
      wave.setAttribute('d', d + ` L120 ${top + 4} L0 ${top + 4} Z`);
    } else wave.setAttribute('d', '');
    if (left <= 0) {
      time.textContent = 'Dry';
      go.textContent = 'Next step';
      if (!run.chimed) {
        run.chimed = true;
        chime();
        const at = run.index;
        setTimeout(() => {
          if (run && run.phase === 'wait' && run.index === at) endWait();
        }, 1400);
      }
    } else time.textContent = fmtDur(left);
  };
  update();
  tick = setInterval(update, 200);
  root().querySelector('[data-more]').addEventListener('click', () => {
    const base = Math.max(run.waitEnd, Date.now());
    run.waitEnd = base + 60000;
    run.waitTotal = Math.max(run.waitTotal, (run.waitEnd - Date.now()) / 1000);
    run.chimed = false;
    mark(steps()[run.index].id).waitAddedSec += 60;
    go.textContent = 'Skip wait';
    update();
  });
  go.addEventListener('click', endWait);
}

function finish() {
  const r = ROUTINES[run.routine];
  addLog({
    date: dayKey(),
    routine: run.routine,
    slot: r.slot,
    season: run.conditions.season,
    startedAt: run.startedAt,
    finishedAt: Date.now(),
    skipped: [...new Set(run.skipped)],
    swaps: Object.keys(run.swaps),
    steps: steps().map((st) => ({ id: st.id, ...(st.swapped ? { swapped: true } : {}), ...run.timeline[st.id] })),
  });
  run.phase = 'done';
  render();
  checkin(true);
}

function doneLine(n) {
  const s = dayStatus(dayKey());
  if (s.am && s.pm) return n > 1 ? `Morning and evening both done. That’s a ${n}-day streak.` : 'Morning and evening both done today.';
  if (s.pm) return 'Evening done. The morning routine wasn’t logged today.';
  if (s.am) return 'Morning done. Evening routine is next.';
  return 'Your main morning routine is still to do after the gym.';
}

function renderDone() {
  const n = streak();
  const mins = Math.max(1, Math.round((Date.now() - run.startedAt) / 60000));
  root().innerHTML = `${header()}
    <div class="runner-body done" tabindex="-1">
      <svg class="drop small" viewBox="0 0 120 140" aria-hidden="true"><path d="${DROP}" class="drop-full"/></svg>
      <h1 class="runner-title">${esc(routineLabel(run.routine, skinDate(), state.settings))} logged.</h1>
      <p class="runner-lede">Took ${mins} min. ${doneLine(n)}</p>
      ${run.skipped.length ? `<p class="muted">Skipped ${run.skipped.length} step${run.skipped.length > 1 ? 's' : ''}.</p>` : ''}
    </div>
    <footer class="runner-foot"><button class="primary" data-finish>Close</button></footer>`;
  root().querySelector('[data-finish]').addEventListener('click', close);
}

function dur(sec) {
  if (sec < 60) return `${sec} seconds`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}
