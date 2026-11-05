// Your skincare plan as data. Edit this file to change products, portions,
// order or wait times. Wait times are in seconds.
//
// Step fields:
//   product   name shown large on screen
//   area      where it goes
//   portion   { all } or { summer, winter } (summer/winter override all)
//   how       how to apply
//   note      { summer, winter } extra seasonal guidance
//   wait      { summer, winter, label } drying countdown after the step (seconds).
//             These are defaults; each can be changed in Settings > Drying times.
//   alt       an alternative product the step can be swapped to
//   only      'summer' or 'winter' to include a step in one season only

const CETAPHIL_ALT = {
  reason: 'Skin flaking or stinging?',
  product: 'Cetaphil Oily Skin Cleanser',
  portion: '1 pump',
  how: 'Use the non-active, barrier-safe wash instead of the acid wash today.',
};

const NIGHT_CREAM = {
  product: 'COSRX Cream or Estée Lauder Night Cream',
  area: 'Face & neck',
  portion: {
    all: '1 pea-sized amount',
    winter: '1 very full, plump pea-sized amount',
  },
  how: 'Moisturise face and neck. Keep it completely away from the under-eye milia.',
  note: { winter: 'Winter: be generous so the cream locks in moisture against dry air.' },
};

const BODY_TONER = {
  product: 'Medicube Kojic Acid Toner',
  area: 'Arms & feet',
  portion: { all: 'A few splashes or a cotton pad' },
  how: 'Tone arms and feet for de-tanning.',
  note: { summer: 'Summer: keep up the nightly body toning, and wear body sunscreen on arms and feet during the day.' },
  wait: { summer: 60, winter: 60, label: 'Let the toner dry on arms and feet' },
};

const BODY_LOTION = {
  product: 'Plain body lotion',
  area: 'Arms & feet',
  portion: { all: 'Enough to cover arms and feet' },
  how: 'A basic, non-active lotion to finish.',
};

export const ROUTINES = {
  preGym: {
    id: 'preGym',
    slot: 'am',
    name: 'Pre-gym morning',
    blurb: 'Rinse and sunscreen before the school drop',
    tone: 'dawn',
    reminders: ['Never use the Chemist at Play wash before exercising.'],
    steps: [
      {
        id: 'pre-cleanse',
        product: 'Water rinse or Cetaphil Oily Skin Cleanser',
        area: 'Face',
        portion: { all: 'Water only, or 1 pump of Cetaphil' },
        how: 'Gently remove night-time residue without stripping. No Chemist at Play wash before the gym.',
        wait: { summer: 30, winter: 30, label: 'Pat dry before sunscreen' },
      },
      {
        id: 'pre-spf',
        product: 'Beauty of Joseon Sunscreen',
        area: 'Face & neck',
        portion: { all: '2 full finger lengths' },
        how: 'Apply before the school drop to protect against morning UV.',
        note: { summer: 'Summer: use the full 2-finger length now (around 7:30). You will reapply completely after your bath.' },
      },
    ],
  },

  postGym: {
    id: 'postGym',
    slot: 'am',
    name: 'Post-gym morning',
    altName: 'Main morning',
    blurb: 'Full AM routine after your bath',
    tone: 'sea',
    reminders: [],
    steps: [
      {
        id: 'post-cleanse',
        product: 'Chemist at Play AHA/PHA Wash',
        area: 'Face',
        portion: { all: '1 coin-sized amount' },
        how: 'Cleanse away sweat, gym oils and old sunscreen.',
        note: { winter: 'Winter: if skin flakes or stings, swap to Cetaphil below.' },
        alt: CETAPHIL_ALT,
      },
      {
        id: 'post-anr',
        product: 'Estée Lauder ANR Serum',
        area: 'Face & neck',
        portion: { all: '1 full dropper' },
        how: 'Apply to damp skin straight after cleansing.',
        wait: { summer: 60, winter: 60, label: 'Let the ANR sink in' },
      },
      {
        id: 'post-cream',
        product: 'COSRX Moisturizing Cream',
        area: 'Face & neck',
        portion: {
          all: '1 pea-sized amount',
          summer: 'A very thin layer',
          winter: '1 very full, plump pea-sized amount',
        },
        how: 'Moisturise face and neck.',
        note: {
          summer: 'Summer: apply very thinly to avoid a greasy feel in the heat.',
          winter: 'Winter: be generous to lock in moisture.',
        },
        wait: { summer: 60, winter: 120, label: 'Let the cream settle before sunscreen' },
      },
      {
        id: 'post-spf',
        product: 'Beauty of Joseon Sunscreen',
        area: 'Face & neck',
        portion: { all: '2 full finger lengths' },
        how: 'Reapply for full-day protection.',
        note: { summer: 'Summer: completely reapply a fresh 2-finger length after the bath.' },
      },
      {
        id: 'post-body-spf',
        only: 'summer',
        product: 'Body sunscreen',
        area: 'Arms & feet',
        portion: { all: 'Enough to cover arms and feet' },
        how: 'Defend your de-tanning progress during the day.',
      },
    ],
  },

  retinal: {
    id: 'retinal',
    slot: 'pm',
    name: 'Retinal night',
    blurb: 'Mondays and Thursdays',
    tone: 'gold',
    days: [1, 4],
    reminders: [
      'Keep the Medicube Kojic toner off your face tonight.',
      'Keep creams and toner away from under-eye milia. Leave that area bare after the eye serum.',
    ],
    steps: [
      {
        id: 'ret-cleanse',
        product: 'Cetaphil Oily Skin Cleanser',
        area: 'Face',
        portion: { all: '1 pump' },
        how: 'Gentle cleanse. No acids tonight.',
        wait: { summer: 30, winter: 30, label: 'Pat your face completely dry' },
      },
      {
        id: 'ret-anr',
        product: 'Estée Lauder ANR Serum',
        area: 'Face & neck',
        portion: { all: '1 full dropper' },
        how: 'Press into face and neck, then let it dry completely before the retinal.',
        note: { winter: 'Winter: wait the full 5 minutes so skin is bone-dry.' },
        wait: { summer: 180, winter: 300, label: 'Let the ANR dry until bone-dry' },
      },
      {
        id: 'ret-eye',
        product: 'Medik8 Crystal Retinal Eye 3',
        area: 'Under-eyes',
        portion: { all: '½ rice grain in total' },
        how: 'Pat directly onto the milia only. Leave the area bare afterwards.',
        wait: { summer: 60, winter: 60, label: 'Let the eye serum set' },
      },
      {
        id: 'ret-face',
        product: 'Medik8 Crystal Retinal 3',
        area: 'Face',
        portion: { all: '2 pumps' },
        how: 'Clears pores and pigmentation. Avoid eyes and lips.',
        wait: { summer: 120, winter: 120, label: 'Let the retinal absorb before moisturiser' },
      },
      { id: 'ret-cream', ...NIGHT_CREAM, how: 'Moisturise face and neck, but leave the under-eye area bare.' },
      { id: 'ret-body', ...BODY_TONER },
      { id: 'ret-lotion', ...BODY_LOTION },
    ],
  },

  rest: {
    id: 'rest',
    slot: 'pm',
    name: 'Rest night',
    blurb: 'Tue, Wed, Fri, Sat and Sun',
    tone: 'dusk',
    days: [2, 3, 5, 6, 0],
    reminders: ['Keep the toner and creams away from under-eye milia.'],
    steps: [
      {
        id: 'rest-cleanse',
        product: 'Chemist at Play AHA/PHA Wash',
        area: 'Face',
        portion: { all: '1 coin-sized amount' },
        how: 'Cleanse surface build-up and unclog pores.',
        alt: CETAPHIL_ALT,
        wait: { summer: 30, winter: 30, label: 'Pat your face dry' },
      },
      {
        id: 'rest-kojic',
        product: 'Medicube Kojic Acid Toner',
        area: 'Face',
        portion: { all: 'A few splashes or a cotton pad' },
        how: 'Pat onto the face, avoiding the eyes.',
        wait: { summer: 60, winter: 60, label: 'Let the toner absorb' },
      },
      {
        id: 'rest-anr',
        product: 'Estée Lauder ANR Serum',
        area: 'Face & neck',
        portion: { all: '1 full dropper' },
        how: 'Press into face and neck.',
        wait: { summer: 60, winter: 60, label: 'Let the ANR sink in' },
      },
      { id: 'rest-cream', ...NIGHT_CREAM },
      { id: 'rest-body', ...BODY_TONER },
      { id: 'rest-lotion', ...BODY_LOTION },
    ],
  },
};

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

// The full plan in words, given to the AI chat as context.
export const PLAN_TEXT = `SKINCARE & DE-TANNING MASTER PLAN

SCHEDULE
Every morning, pre-gym & school drop: 1) Water rinse or Cetaphil Oily Skin Cleanser 2) Beauty of Joseon Sunscreen. Gently remove night-time residue without stripping. Apply sunscreen before school drop-off. Do not use Chemist at Play wash before the gym.
Every morning, post-gym bath (official AM; on non-gym days this is the main morning routine): 1) Chemist at Play AHA/PHA Wash 2) Estée Lauder ANR Serum 3) COSRX Moisturizing Cream 4) Beauty of Joseon Sunscreen. Cleanse sweat, gym oils and old sunscreen. ANR on damp skin, then moisturise face/neck. Reapply sunscreen.
Mon & Thu RETINAL PM: 1) Cetaphil Oily Skin Cleanser 2) Estée Lauder ANR Serum 3) Medik8 Crystal Retinal Eye 3 4) Medik8 Crystal Retinal 3 (face) 5) COSRX Cream or EL Night Cream 6) Body de-tanning arms & feet. Gentle cleanse (no acids). Press ANR in, wait 3–5 minutes until bone-dry. Pat eye serum strictly over milia. Face retinal avoiding eyes/lips. Moisturise face/neck but leave under-eye bare. Medicube toner on limbs, then plain lotion.
Tue, Wed, Fri, Sat & Sun REST PM: 1) Chemist at Play AHA/PHA Wash 2) Medicube Kojic Acid Toner (face) 3) Estée Lauder ANR Serum 4) COSRX Cream or EL Night Cream 5) Body de-tanning arms & feet. Pat Kojic toner on face avoiding eyes. ANR, then moisturiser. Medicube toner on limbs, then plain lotion.

QUICK REMINDERS
Never use Chemist at Play wash before exercising. On retinal nights keep Medicube Kojic toner off the face. Keep face creams and Medicube toner away from under-eye milia; leave that area bare after the eye serum. Arms/feet: Medicube toner nightly, then a basic non-active body lotion.

PORTIONS
Medicube Kojic Acid Toner: a few splashes / cotton pad. Body nightly; face on rest nights only; avoid eyes.
Chemist at Play AHA/PHA Wash: 1 coin-sized amount. Post-gym bath and rest nights. Not before the gym.
Cetaphil Oily Skin Cleanser: 1 pump. Retinal nights, optionally before the gym.
Estée Lauder ANR Serum: 1 full dropper. Face/neck. On retinal nights let dry completely. Only post-gym/evening.
Medik8 Crystal Retinal Eye 3: ½ rice grain total. Pat on under-eye milia; leave bare afterwards.
Medik8 Crystal Retinal 3 (face): 2 pumps. Avoid eyes and lips.
COSRX Cream / EL Night Cream: 1 pea-sized amount. Face/neck. Avoid under-eye milia.
Beauty of Joseon Sunscreen: 2 full finger lengths. Before school drop and reapply post-gym.

SEASONAL ADJUSTMENTS
Winter: wait a full 5 minutes after ANR on Mon/Thu before retinal. Use a very full, plump pea of night cream. If skin flakes or stings, swap the morning Chemist at Play wash for Cetaphil post-gym.
Summer: apply COSRX very thinly post-bath. Full 2-finger sunscreen at 7:30 AM, then completely reapply another 2-finger length after the 10:30 AM bath. Continue nightly Medicube body toning and use body sunscreen on arms/feet during the day.

This plan is informational, not medical advice.`;
