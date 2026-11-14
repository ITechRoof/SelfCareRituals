import { skinDate, DAY_START_HOUR } from './util.js';

// Routine logic. The routine itself (products, order, portions, waits) lives
// encrypted per person in plans/ and is loaded after they sign in.
// To edit one, change private/<name>.mjs and run: node tools/encrypt-plan.mjs <name>

export let ROUTINES = {}; // the routine in use: the plan plus this person's own edits
export let PLAN_TEXT = '';
export let ACCOUNT = null; // { key, displayName } for buddy nudges
let ADMIN = {}; // the plan exactly as encrypted by the admin
let BASE = {}; // the routine edits are layered on: the admin plan, or one approved from the skin coach

export function setPlan(plan) {
  ADMIN = plan.routines;
  BASE = ADMIN;
  PLAN_TEXT = plan.text;
  ACCOUNT = plan.account || null;
  applyEdits({});
}

export const baseRoutines = () => BASE;

// A routine approved from the skin coach replaces the admin plan on this phone.
export function usePersonalPlan(pp) {
  BASE = pp?.routines || ADMIN;
}
export const usingPersonalPlan = () => BASE !== ADMIN;

const SLOTS = {
  preGym: { slot: 'am', tone: 'dawn', blurb: 'Quick routine before exercise or heading out' },
  postGym: { slot: 'am', tone: 'sea', blurb: 'Your full morning routine', altName: 'Main morning' },
  retinal: { slot: 'pm', tone: 'gold', blurb: 'Treatment evenings' },
  rest: { slot: 'pm', tone: 'dusk', blurb: 'Other evenings' },
};
const FROM_COACH = { pre_gym: 'preGym', main_morning: 'postGym', treatment_evening: 'retinal', regular_evening: 'rest' };

// Turns the skin coach's proposal into the app's routine format.
export function routinesFromProposal(p, tag = 'x') {
  const out = {};
  for (const [key, id] of Object.entries(FROM_COACH)) {
    const src = p.routines?.[key] || { name: SLOTS[id].altName || id, steps: [] };
    out[id] = {
      id,
      ...SLOTS[id],
      name: src.name || id,
      reminders: Array.isArray(src.reminders) ? src.reminders.slice(0, 4) : [],
      steps: (src.steps || []).map((st, i) => ({
        id: `ai-${tag}-${id}-${i}`,
        product: String(st.product || 'Step').slice(0, 120),
        area: st.area || 'Face',
        portion: { all: st.amount || '' },
        how: st.how || '',
        ...(st.wait_seconds > 0 ? { wait: { summer: Math.min(+st.wait_seconds, 900), winter: Math.min(+st.wait_seconds, 900), label: `Let the ${st.product} absorb` } } : {}),
        ...(st.season === 'summer' || st.season === 'winter' ? { only: st.season } : {}),
      })),
    };
    if (!out[id].steps.length) out[id].steps.push({ id: `ai-${tag}-${id}-0`, product: 'Rinse with water', area: 'Face', portion: { all: '' }, how: '' });
  }
  const days = (p.retinal_days || []).filter((d) => d >= 0 && d <= 6);
  out.retinal.days = [...new Set(days)].sort();
  out.rest.days = [0, 1, 2, 3, 4, 5, 6].filter((d) => !out.retinal.days.includes(d));
  return out;
}

// The routine actually in use, in words (for the skin coach).
export function routineInWords() {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return ROUTINE_ORDER.filter((id) => ROUTINES[id])
    .map((id) => {
      const r = ROUTINES[id];
      const when = r.days ? ` (${r.days.map((d) => names[d]).join(', ') || 'no days'})` : '';
      const steps = r.steps
        .filter((st) => !st.off)
        .map((st, i) => {
          const p = st.portion || {};
          const amt = p.summer !== undefined || p.winter !== undefined ? `summer: ${p.summer ?? p.all}, winter: ${p.winter ?? p.all}` : p.all || '';
          const wait = st.wait ? `, then wait ${Math.round((st.wait.winter || st.wait.summer) / 60 * 10) / 10} min` : '';
          return `  ${i + 1}. ${st.product}${amt ? ` (${amt})` : ''}${st.area ? ` on ${st.area}` : ''}${st.only ? ` [${st.only} only]` : ''}${st.days ? ` [${st.days.map((d) => names[d]).join(', ')} only]` : ''}${wait}`;
        })
        .join('\n');
      return `${r.name}${when}:\n${steps}`;
    })
    .join('\n\n');
}
export const findBaseStep = (id) => {
  for (const r of Object.values(BASE)) for (const st of r.steps) if (st.id === id) return st;
  return null;
};

// Personal edits, saved on this phone only (state.settings.routineEdits):
//   { steps: { <stepId>: { product, portion: {all}|{summer,winter}, how, off } },
//     added: { <routineId>: [ { id: 'u-…', product, area, portion: {all}, how, wait, only, after } ] },
//     retinalDays: [1, 4] }
// `after` is the id of the step it follows ('__start' = first). If that step is gone, it goes last.
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
  for (const [rid, list] of Object.entries(edits.added || {})) {
    const routine = r[rid];
    if (!routine) continue;
    for (const a of list) {
      const step = {
        id: a.id,
        product: a.product,
        area: a.area || '',
        portion: { all: a.portion?.all || '' },
        how: a.how || '',
        ...(a.wait ? { wait: { summer: a.wait, winter: a.wait, label: `Let the ${a.product} dry` } } : {}),
        ...(a.only ? { only: a.only } : {}),
        added: true,
      };
      const at = a.after === '__start' ? -1 : routine.steps.findIndex((x) => x.id === a.after);
      if (a.after !== '__start' && at === -1) routine.steps.push(step);
      else routine.steps.splice(at + 1, 0, step);
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
  for (const [rid, list] of Object.entries(edits.added || {})) {
    const routine = ROUTINES[rid] || BASE[rid];
    for (const a of list) {
      const idx = routine?.steps.findIndex((x) => x.id === a.id) ?? -1;
      const prev = idx > 0 ? routine.steps[idx - 1].product : null;
      lines.push(
        `- ${BASE[rid]?.name}: added "${a.product}"${a.area ? ` on ${a.area}` : ''}${a.portion?.all ? `, ${a.portion.all}` : ''}` +
          `${prev ? `, after "${prev}"` : ', as the first step'}${a.only ? ` (${a.only} only)` : ''}${a.how ? `. How: ${a.how}` : ''}`
      );
    }
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
  if (id === 'postGym' && settings && !settings.gymDays.includes(date.getDay())) return r.altName || r.name;
  return r.dayNames?.[date.getDay()] || r.name;
}

// Resolve a routine's steps for a season, applying any swaps.
// A step with `days: [3]` only appears on those weekdays (0 = Sunday).
export function resolveSteps(routineId, season, swaps = {}, waits = {}, date = skinDate()) {
  return ROUTINES[routineId].steps
    .filter((s) => !s.off && (!s.only || s.only === season) && (!s.days || s.days.includes(date.getDay())))
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

