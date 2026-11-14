import { state, save, dayStatus, timeEstimated, streaks, completion, logsOn, setSlotDone } from './store.js';
import { ROUTINES, routineLabel, isRetinalDay } from './plan.js';
import { sheet, closeSheet } from './photos.js';
import { checkin } from './nudge.js';
import { esc, dateKey, dayKey, skinDate, parseKey, addDays, weekStart, fmtDate, fmtClock, MONTH_SHORT, DAY_SHORT, toast } from './util.js';

const WEEKS = 16;

export function renderProgress(el) {
  const st = streaks();
  const c30 = completion(30);
  const thisWeek = weekStart(skinDate());
  const first = addDays(thisWeek, -(WEEKS - 1) * 7);
  const todayKey = dayKey();
  const gymDays = state.settings.gymDays;

  // ---- Heatmap: each day split into a morning half and an evening half ----
  // Newest week on the left, going back in time to the right.
  let cells = '';
  let months = '';
  let lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const monday = addDays(thisWeek, -w * 7);
    const m = addDays(monday, 6).getMonth();
    if (m !== lastMonth) months += `<span class="hm-month" style="grid-column:${w + 2} / span 3;grid-row:1">${MONTH_SHORT[m]}</span>`;
    lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const day = addDays(monday, d);
      const k = dateKey(day);
      const future = k > todayKey;
      const s = dayStatus(k);
      const label = future ? fmtDate(day) : `${fmtDate(day)}: morning ${s.am ? 'done' : 'missed'}, evening ${s.pm ? 'done' : 'missed'}`;
      cells += `<button class="cell ${future ? 'future' : ''}" style="grid-column:${w + 2};grid-row:${d + 2}"
        data-day="${k}" ${future ? 'disabled' : ''} aria-label="${label}">
        <span class="half am ${s.am ? 'on' : ''}"></span><span class="half pm ${s.pm ? `on ${s.pm}` : ''}"></span></button>`;
    }
  }

  // ---- This week: rows = morning / evening, columns = days ----
  const days = [...Array(7)].map((_, i) => addDays(thisWeek, i));
  const showPre = days.some((d) => gymDays.includes(d.getDay()) || dayStatus(dateKey(d)).pre);
  const head = days
    .map((d) => {
      const k = dateKey(d);
      return `<th scope="col" class="${k === todayKey ? 'today' : ''}">${DAY_SHORT[d.getDay()]}${isRetinalDay(d) ? '<span class="r" title="${esc(ROUTINES.retinal.name)}">${esc(ROUTINES.retinal.name[0])}</span>' : ''}</th>`;
    })
    .join('');
  const row = (slot, title) =>
    `<tr><th scope="row">${title}</th>${days
      .map((d) => {
        const k = dateKey(d);
        const s = dayStatus(k);
        const future = k > todayKey;
        if (slot === 'pre' && !gymDays.includes(d.getDay()) && !s.pre) return '<td><span class="tick none" aria-hidden="true"></span></td>';
        const on = slot === 'pm' ? !!s.pm : s[slot];
        const kind = slot === 'pm' ? (isRetinalDay(d) ? 'retinal' : 'rest') : slot;
        return `<td><button class="tick ${kind} ${on ? 'on' : ''}" data-tick="${slot}" data-day="${k}" ${future ? 'disabled' : ''}
          aria-pressed="${on}" aria-label="${title} on ${fmtDate(d)}"></button></td>`;
      })
      .join('')}</tr>`;

  const weekAm = days.filter((d) => dayStatus(dateKey(d)).am).length;
  const weekPm = days.filter((d) => dayStatus(dateKey(d)).pm).length;
  const daysSoFar = days.filter((d) => dateKey(d) <= todayKey).length;

  const noteKey = dateKey(thisWeek);
  const pastNotes = Object.entries(state.notes)
    .filter(([k, v]) => k !== noteKey && v.trim())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));

  el.innerHTML = `
    <section class="hero">
      <p class="eyebrow-date">Days with both morning and evening done</p>
      <h1 class="display">${st.full ? `${st.full}-day streak` : 'Start a streak'}</h1>
      <div class="stats">
        <div><span class="stat-n">${c30.am}<small>/30</small></span><span class="stat-l"><i class="key am"></i>Mornings, last 30 days</span><span class="stat-s">${st.am}-day morning streak</span></div>
        <div><span class="stat-n">${c30.pm}<small>/30</small></span><span class="stat-l"><i class="key pm"></i>Evenings, last 30 days</span><span class="stat-s">${st.pm}-day evening streak</span></div>
      </div>
    </section>

    <section class="block">
      <h2 class="h2">This week</h2>
      <div class="table-scroll">
        <table class="tracker">
          <thead><tr><td></td>${head}</tr></thead>
          <tbody>
            ${showPre ? row('pre', 'Pre-gym') : ''}
            ${row('am', 'Morning')}
            ${row('pm', 'Evening')}
          </tbody>
        </table>
      </div>
      <p class="muted small">${weekAm} of ${daysSoFar} mornings and ${weekPm} of ${daysSoFar} evenings so far. Tap a circle to tick a routine you did without the app.</p>
    </section>

    <section class="block">
      <h2 class="h2">Last ${WEEKS} weeks <span class="muted small">newest first</span></h2>
      <div class="heat-scroll">
        <div class="heat" style="grid-template-columns:24px repeat(${WEEKS},minmax(15px,1fr))">
          ${['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => `<span class="hm-day" style="grid-row:${i + 2}">${d}</span>`).join('')}
          ${months}${cells}
        </div>
      </div>
      <div class="heat-legend">
        <span><i class="key am"></i>Morning (top)</span>
        <span><i class="key rest"></i>${esc(ROUTINES.rest.name)}</span>
        <span><i class="key retinal"></i>${esc(ROUTINES.retinal.name)}</span>
      </div>
    </section>

    <section class="block">
      <h2 class="h2">Skin notes for this week</h2>
      <textarea class="notes" rows="4" placeholder="How is your skin this week? Any changes or irritation?">${esc(state.notes[noteKey] || '')}</textarea>
      ${
        pastNotes.length
          ? `<details class="past-notes"><summary>Earlier weeks (${pastNotes.length})</summary>${pastNotes
              .map(([k, v]) => `<div class="past-note"><p class="muted small">Week of ${fmtDate(parseKey(k))}</p><p>${esc(v)}</p></div>`)
              .join('')}</details>`
          : ''
      }
    </section>

    <section class="block">
      <h2 class="h2">Timeline</h2>
      ${timeline(todayKey)}
    </section>`;

  const rerender = () => renderProgress(el);

  el.querySelector('.notes').addEventListener('input', (e) => {
    state.notes[noteKey] = e.target.value;
    save();
  });

  el.querySelectorAll('[data-tick]').forEach((b) =>
    b.addEventListener('click', () => toggle(b.dataset.day, b.dataset.tick, rerender))
  );
  el.querySelectorAll('.cell[data-day]').forEach((c) => c.addEventListener('click', () => openDay(c.dataset.day, rerender)));

  el.querySelectorAll('[data-tl-day]').forEach((b) => b.addEventListener('click', () => openDay(b.dataset.tlDay, rerender)));
  el.querySelector('[data-tl-more]')?.addEventListener('click', () => {
    timelineDays += 14;
    rerender();
    el.querySelector('.timeline')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  });
}

// ---- Timeline: every day, newest first ----
let timelineDays = 14;

const ORDER = { preGym: 0, postGym: 1, retinal: 2, rest: 2 };

function entry(l, day) {
  const name = routineLabel(l.routine, day, state.settings);
  const mins = l.startedAt && l.finishedAt && !l.manual ? Math.max(1, Math.round((l.finishedAt - l.startedAt) / 60000)) : null;
  const details = [
    timeEstimated(l) ? '' : fmtClock(l.finishedAt),
    mins ? `${mins} min` : '',
    l.manual ? 'ticked' : '',
    l.skipped?.length ? `skipped ${l.skipped.length}` : '',
    l.swaps?.length ? 'gentler swap' : '',
  ].filter(Boolean);
  const kind = l.routine === 'preGym' ? 'pre' : l.routine === 'postGym' ? 'am' : l.routine;
  return `<li class="tl-entry"><i class="tl-dot ${kind}"></i><span>${esc(name)}</span><span class="muted small">${details.map(esc).join(' · ')}</span></li>`;
}

function timeline(todayKey) {
  if (!state.logs.length) return '<p class="muted">Finish a routine and it will show up here.</p>';
  const earliest = state.logs.reduce((m, l) => (l.date < m ? l.date : m), todayKey);
  const out = [];
  let d = parseKey(todayKey);
  let shown = 0;
  let lastWeek = null;
  const yesterday = dateKey(addDays(parseKey(todayKey), -1));
  while (shown < timelineDays && dateKey(d) >= earliest) {
    const k = dateKey(d);
    const wk = dateKey(weekStart(d));
    if (wk !== lastWeek) {
      const note = (state.notes[wk] || '').trim();
      out.push(`<li class="tl-week"><span>Week of ${fmtDate(parseKey(wk))}</span>${note ? `<p class="tl-note">${esc(note)}</p>` : ''}</li>`);
      lastWeek = wk;
    }
    const logs = logsOn(k).sort((a, b) => (ORDER[a.routine] ?? 3) - (ORDER[b.routine] ?? 3) || a.finishedAt - b.finishedAt);
    const s = dayStatus(k);
    const label = k === todayKey ? 'Today' : k === yesterday ? 'Yesterday' : fmtDate(d);
    const status = s.am && s.pm ? 'both' : s.am || s.pm ? 'half' : 'none';
    out.push(`<li class="tl-day ${status}">
      <button class="tl-head" data-tl-day="${k}" aria-label="Change ticks for ${fmtDate(d)}">
        <span class="tl-date">${label}</span>
        <span class="tl-sum">${status === 'both' ? 'Morning and evening' : s.am ? 'Morning only' : s.pm ? 'Evening only' : k === todayKey ? 'Not yet' : 'Missed'}</span>
      </button>
      ${logs.length ? `<ul class="tl-entries">${logs.map((l) => entry(l, d)).join('')}</ul>` : ''}
    </li>`);
    d = addDays(d, -1);
    shown++;
  }
  const more = dateKey(d) >= earliest;
  return `<ol class="timeline">${out.join('')}</ol>${more ? '<div class="row-actions"><button class="ghost" data-tl-more>Show earlier</button></div>' : ''}`;
}

function isOn(key, slot) {
  const s = dayStatus(key);
  return slot === 'pm' ? !!s.pm : s[slot];
}

function toggle(key, slot, after) {
  const on = isOn(key, slot);
  if (on) {
    const guided = logsOn(key).some(
      (l) => !l.manual && (slot === 'pm' ? l.slot === 'pm' : l.routine === (slot === 'pre' ? 'preGym' : 'postGym'))
    );
    if (guided && !confirm('This was logged by a guided routine. Remove it?')) return;
  }
  setSlotDone(key, slot, !on);
  checkin(!on && key === dayKey());
  toast(on ? 'Unticked' : 'Ticked');
  after();
}

function openDay(key, after) {
  const d = parseKey(key);
  const s = dayStatus(key);
  const gym = state.settings.gymDays.includes(d.getDay()) || s.pre;
  const night = isRetinalDay(d) ? ROUTINES.retinal.name : ROUTINES.rest.name;
  const item = (slot, title) =>
    `<label class="day-toggle"><span>${title}</span><input type="checkbox" data-slot="${slot}" ${isOn(key, slot) ? 'checked' : ''}><i></i></label>`;
  const card = sheet(`
    <header class="sheet-head"><h2 class="h2">${fmtDate(d)}</h2><button class="link-btn" data-close>Done</button></header>
    <div class="day-toggles">
      ${gym ? item('pre', 'Pre-gym') : ''}
      ${item('am', routineLabel('postGym', d, state.settings))}
      ${item('pm', night)}
    </div>`);
  card.querySelector('.sheet-card').classList.remove('full');
  card.querySelectorAll('[data-slot]').forEach((i) =>
    i.addEventListener('change', () => {
      const want = i.checked;
      if (want !== isOn(key, i.dataset.slot)) {
        if (!want) {
          const guided = logsOn(key).some(
            (l) => !l.manual && (i.dataset.slot === 'pm' ? l.slot === 'pm' : l.routine === (i.dataset.slot === 'pre' ? 'preGym' : 'postGym'))
          );
          if (guided && !confirm('This was logged by a guided routine. Remove it?')) {
            i.checked = true;
            return;
          }
        }
        setSlotDone(key, i.dataset.slot, want);
        checkin(want && key === dayKey());
      }
    })
  );
  card.querySelector('[data-close]').addEventListener('click', () => {
    closeSheet();
    after();
  });
  card.addEventListener('click', (e) => {
    if (e.target === card) {
      closeSheet();
      after();
    }
  });
}
