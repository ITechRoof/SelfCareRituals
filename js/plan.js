// Routine logic. The routine itself (products, order, portions, waits) lives
// encrypted per person in plans/ and is loaded after they sign in.
// To edit one, change private/<name>.mjs and run: node tools/encrypt-plan.mjs <name>

export let ROUTINES = {};
export let PLAN_TEXT = '';
export let ACCOUNT = null; // { key, displayName } for buddy nudges

export function setPlan(plan) {
  ROUTINES = plan.routines;
  PLAN_TEXT = plan.text;
  ACCOUNT = plan.account || null;
}

export const ROUTINE_ORDER = ['preGym', 'postGym', 'retinal', 'rest'];

export function isRetinalDay(date = new Date()) {
  return ROUTINES.retinal.days.includes(date.getDay());
}

// Pick the routine that is most likely due now.
export function suggestRoutine(now, settings, todaysLogs) {
  const slot = now.getHours() < settings.eveningHour ? 'am' : 'pm';
  if (slot === 'pm') return isRetinalDay(now) ? 'retinal' : 'rest';
  const gymDay = settings.gymDays.includes(now.getDay());
  const didPre = todaysLogs.some((l) => l.routine === 'preGym');
  return gymDay && !didPre ? 'preGym' : 'postGym';
}

export function routineLabel(id, date = new Date(), settings) {
  const r = ROUTINES[id];
  if (id === 'postGym' && settings && !settings.gymDays.includes(date.getDay())) return r.altName;
  return r.name;
}

// Resolve a routine's steps for a season, applying any swaps.
export function resolveSteps(routineId, season, swaps = {}, waits = {}) {
  return ROUTINES[routineId].steps
    .filter((s) => !s.only || s.only === season)
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

