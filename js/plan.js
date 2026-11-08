import { skinDate, DAY_START_HOUR } from './util.js';

// Routine logic. The routine itself (products, order, portions, waits) lives
// encrypted per person in plans/ and is loaded after they sign in.
// To edit one, change private/<name>.mjs and run: node tools/encrypt-plan.mjs <name>

export let ROUTINES = {}; // the routine in use: the plan plus this person's own edits
export let PLAN_TEXT = '';
export let ACCOUNT = null; // { key, displayName } for buddy nudges
let BASE = {}; // the plan exactly as encrypted by the admin

export function setPlan(plan) {
  BASE = plan.routines;
  PLAN_TEXT = plan.text;
  ACCOUNT = plan.account || null;
  applyEdits({});
}

export const baseRoutines = () => BASE;
export const findBaseStep = (id) => {
  for (const r of Object.values(BASE)) for (const st of r.steps) if (st.id === id) return st;
  return null;
};

// Personal edits, saved on this phone only (state.settings.routineEdits):
//   { steps: { <stepId>: { product, portion: {all}|{summer,winter}, how, off } },
//     retinalDays: [1, 4] }
// Anything not edited keeps following the admin's plan, including later updates.
export function applyEdits(edits = {}) {
  const r = structuredClone(BASE);
  for (const routine of Object.values(r)) {
    for (const st of routine.steps) {
      const e = edits.steps?.[st.id];
      if (!e) continue;
      if (e.product) st.product = e.product;
      if (e.portion) st.portion = e.portion.all !== undefined ? { all: e.portion.all } : { ...st.portion, ...e.portion };
      if (e.how) st.how = e.how;
      if (e.off) st.off = true;
      st.edited = true;
    }
  }
  if (Array.isArray(edits.retinalDays) && r.retinal && r.rest) {
    r.retinal.days = [...edits.retinalDays].sort();
    r.rest.days = [0, 1, 2, 3, 4, 5, 6].filter((d) => !r.retinal.days.includes(d));
  }
  ROUTINES = r;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The person's changes in words, for the AI chat.
export function describeEdits(edits = {}) {
  const lines = [];
  for (const [id, e] of Object.entries(edits.steps || {})) {
    const base = findBaseStep(id);
    if (!base) continue;
    const routine = Object.values(BASE).find((r) => r.steps.some((x) => x.id === id));
    const parts = [];
    if (e.off) parts.push('turned off (not used any more)');
    if (e.product) parts.push(`product changed to "${e.product}"`);
    if (e.portion) parts.push(`portion changed to ${e.portion.all ?? `summer: ${e.portion.summer}, winter: ${e.portion.winter}`}`);
    if (e.how) parts.push(`how to apply changed to "${e.how}"`);
    if (parts.length) lines.push(`- ${routine?.name}: "${base.product}" ${parts.join('; ')}`);
  }
  if (Array.isArray(edits.retinalDays) && BASE.retinal) {
    lines.push(`- ${BASE.retinal.name} moved to: ${edits.retinalDays.map((d) => DAY_NAMES[d]).join(', ') || 'none'} (other evenings are ${BASE.rest.name})`);
  }
  return lines.join('\n');
}

export const ROUTINE_ORDER = ['preGym', 'postGym', 'retinal', 'rest'];

export function isRetinalDay(date = skinDate()) {
  return ROUTINES.retinal.days.includes(date.getDay());
}

// Pick the routine that is most likely due now.
export function suggestRoutine(now, settings, todaysLogs) {
  const h = now.getHours();
  const day = skinDate(now); // after midnight still counts as the evening before
  const slot = h >= DAY_START_HOUR && h < settings.eveningHour ? 'am' : 'pm';
  if (slot === 'pm') return isRetinalDay(day) ? 'retinal' : 'rest';
  const gymDay = settings.gymDays.includes(day.getDay());
  const didPre = todaysLogs.some((l) => l.routine === 'preGym');
  return gymDay && !didPre ? 'preGym' : 'postGym';
}

export function routineLabel(id, date = skinDate(), settings) {
  const r = ROUTINES[id];
  if (id === 'postGym' && settings && !settings.gymDays.includes(date.getDay())) return r.altName;
  return r.name;
}

// Resolve a routine's steps for a season, applying any swaps.
export function resolveSteps(routineId, season, swaps = {}, waits = {}) {
  return ROUTINES[routineId].steps
    .filter((s) => !s.off && (!s.only || s.only === season))
    .map((s) => {
      const swapped = swaps[s.id] && s.alt;
      return {
        id: s.id,
        product: swapped ? s.alt.product : s.product,
        area: s.area,
        portion: swapped ? s.alt.portion : (s.portion[season] ?? s.portion.all),
        how: swapped ? s.alt.how : s.how,
        note: swapped ? '' : (s.note?.[season] ?? ''),
        wait: waits[s.id]?.[season] ?? (s.wait ? s.wait[season] : 0),
        waitLabel: s.wait?.label ?? 'Let it dry',
        alt: s.alt && !swapped ? s.alt : null,
        swapped: !!swapped,
      };
    });
}

