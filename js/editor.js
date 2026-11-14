// "My routine" editor. Personal changes are saved on this phone only
// (state.settings.routineEdits) and layered on top of the admin's plan.

import { state, save } from './store.js';
import { ROUTINES, ROUTINE_ORDER, baseRoutines, findBaseStep, applyEdits } from './plan.js';
import { sheet, closeSheet } from './photos.js';
import { esc, toast, DAY_SHORT, DAY_LONG } from './util.js';

const edits = () => (state.settings.routineEdits ??= { steps: {} });
function portionText(p) {
  if (p.summer === undefined && p.winter === undefined) return p.all ?? '';
  const su = p.summer ?? p.all;
  const wi = p.winter ?? p.all;
  return su === wi ? su : `${su} (summer), ${wi} (winter)`;
}
const isSeasonal = (p) => (p.summer ?? p.all) !== (p.winter ?? p.all);

export function editCount() {
  const e = state.settings.routineEdits;
  if (!e) return 0;
  const added = Object.values(e.added || {}).reduce((n, list) => n + list.length, 0);
  return Object.keys(e.steps || {}).length + added + (Array.isArray(e.retinalDays) ? 1 : 0);
}

function commit(msg) {
  const e = edits();
  for (const [id, v] of Object.entries(e.steps)) if (!Object.keys(v).length) delete e.steps[id];
  applyEdits(e);
  save();
  if (msg) toast(msg);
}

export function openRoutineEditor(onClose) {
  const card = sheet('<div class="editor"></div>');
  const host = card.querySelector('.editor');
  card.querySelector('.sheet-card').classList.add('editor-card');
  const close = () => {
    closeSheet();
    onClose?.();
  };
  showOverview(host, close);
}

// ---------- Overview: every routine and its steps ----------
function showOverview(host, close) {
  const base = baseRoutines();
  const e = edits();
  host.innerHTML = `
    <header class="sheet-head"><h2 class="h2">My routine</h2><button class="link-btn" data-close>Done</button></header>
    <p class="muted small">Tap a step to swap the product, change the amount or turn it off. Changes stay on this phone, and anything you don’t change keeps following your plan.</p>
    ${ROUTINE_ORDER.filter((id) => base[id])
      .map((id) => {
        const r = ROUTINES[id];
        return `<section class="ed-group" data-scene="${r.tone}">
          <h3 class="ed-title">${esc(r.name)}</h3>
          ${id === 'retinal' ? retinalDaysPicker() : ''}
          <ul class="ed-steps">${r.steps
            .map(
              (st) => `<li><button class="ed-step ${st.off ? 'is-off' : ''}" ${st.added ? `data-added="${id}:${st.id}"` : `data-step="${st.id}"`}>
                <span class="ed-name">${esc(st.product)}${st.only ? ` <span class="ed-tag">${st.only} only</span>` : ''}${st.days ? ` <span class="ed-tag">${st.days.map((d) => DAY_SHORT[d]).join(', ')} only</span>` : ''}</span>
                <span class="ed-meta">${st.off ? 'Turned off' : esc(portionText(st.portion))}</span>
                ${st.added ? '<span class="ed-badge">Added</span>' : st.edited ? '<span class="ed-badge">Changed</span>' : ''}
              </button></li>`
            )
            .join('')}</ul>
          <button class="ed-add" data-add="${id}">+ Add a step</button>
        </section>`;
      })
      .join('')}
    ${editCount() ? '<div class="row-actions"><button class="ghost danger" data-reset-all>Undo all my changes</button></div>' : ''}`;

  host.querySelector('[data-close]').addEventListener('click', close);
  host.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => showStep(host, b.dataset.step, close)));
  host.querySelectorAll('[data-added]').forEach((b) =>
    b.addEventListener('click', () => {
      const [rid, sid] = b.dataset.added.split(':');
      showAdded(host, rid, sid, close);
    })
  );
  host.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => showAdded(host, b.dataset.add, null, close)));
  host.querySelector('[data-reset-all]')?.addEventListener('click', () => {
    if (!confirm('Undo all your changes and go back to your original routine?')) return;
    state.settings.routineEdits = { steps: {}, added: {} };
    commit('Back to your original routine');
    showOverview(host, close);
  });
  wireRetinalDays(host, () => showOverview(host, close));
}

// ---------- Retinal nights ----------
function retinalDaysPicker() {
  const base = baseRoutines();
  const days = ROUTINES.retinal.days;
  const warn = retinalWarning(days, base.retinal.days.length);
  return `<div class="ed-days">
      <p class="small">Which evenings? The other evenings are ${esc(ROUTINES.rest.name)}.</p>
      <div class="days">${[1, 2, 3, 4, 5, 6, 0]
        .map((d) => `<label class="day"><input type="checkbox" value="${d}" data-rday ${days.includes(d) ? 'checked' : ''}><span>${DAY_SHORT[d]}</span></label>`)
        .join('')}</div>
      ${warn ? `<p class="ed-warn">${warn}</p>` : ''}
    </div>`;
}

function retinalWarning(days, planned) {
  if (!days.length) return 'No retinal nights selected, so every evening will be a rest night.';
  const set = new Set(days);
  if (days.some((d) => set.has((d + 1) % 7))) return 'Retinal nights back to back can irritate skin. Your original plan spaces them out.';
  if (days.length > planned) return `That’s more than your original plan (${planned} a week). Increase slowly and watch for dryness or stinging.`;
  return '';
}

function wireRetinalDays(host, rerender) {
  const boxes = host.querySelectorAll('[data-rday]');
  boxes.forEach((b) =>
    b.addEventListener('change', () => {
      const chosen = [...boxes].filter((x) => x.checked).map((x) => +x.value);
      const original = [...baseRoutines().retinal.days].sort().join();
      const e = edits();
      if ([...chosen].sort().join() === original) delete e.retinalDays;
      else e.retinalDays = chosen;
      commit();
      rerender();
    })
  );
}

// ---------- One step ----------
function showStep(host, id, close) {
  const base = findBaseStep(id);
  const cur = Object.values(ROUTINES).flatMap((r) => r.steps).find((x) => x.id === id);
  const e = edits().steps[id] || {};
  const seasonal = isSeasonal(base.portion) || (e.portion && e.portion.all === undefined);
  const sameProduct = Object.values(baseRoutines())
    .flatMap((r) => r.steps.map((st) => ({ st, r })))
    .filter(({ st }) => st.id !== id && st.product === base.product);
  const isSunscreen = /sunscreen|spf/i.test(base.product);

  host.innerHTML = `
    <header class="sheet-head"><button class="link-btn" data-back>‹ Back</button><button class="link-btn" data-save>Save</button></header>
    <h2 class="h2">${esc(cur.product)}</h2>
    ${cur.edited ? `<p class="muted small">Your plan says: ${esc(base.product)}, ${esc(portionText(base.portion))}</p>` : ''}

    <label class="day-toggle"><span>Use this step</span><input type="checkbox" data-use ${cur.off ? '' : 'checked'}><i></i></label>
    ${isSunscreen ? '<p class="ed-warn" data-sun-warn hidden>Sunscreen protects your skin and your de-tanning progress. Only turn it off if you’re using a different one.</p>' : ''}

    <label class="field">Product
      <input type="text" data-product value="${esc(cur.product)}" autocomplete="off">
    </label>
    ${
      sameProduct.length
        ? `<label class="check"><input type="checkbox" data-everywhere checked> Change it in the other ${sameProduct.length} step${sameProduct.length > 1 ? 's' : ''} that use${sameProduct.length > 1 ? '' : 's'} this product</label>`
        : ''
    }

    ${
      seasonal
        ? `<div class="dry-pair">
            <label class="field">Amount in summer <input type="text" data-p-summer value="${esc(cur.portion.summer ?? cur.portion.all ?? '')}"></label>
            <label class="field">Amount in winter <input type="text" data-p-winter value="${esc(cur.portion.winter ?? cur.portion.all ?? '')}"></label>
          </div>`
        : `<label class="field">Amount <input type="text" data-p-all value="${esc(portionText(cur.portion))}"></label>`
    }

    <label class="field">How to apply
      <textarea rows="3" data-how>${esc(cur.how || '')}</textarea>
    </label>

    ${cur.edited ? '<div class="row-actions"><button class="ghost" data-reset>Back to my plan’s version</button></div>' : ''}`;

  const q = (s) => host.querySelector(s);
  const back = () => showOverview(host, close);
  q('[data-back]').addEventListener('click', back);
  q('[data-use]').addEventListener('change', (ev) => {
    const w = q('[data-sun-warn]');
    if (w) w.hidden = ev.target.checked;
  });
  q('[data-reset]')?.addEventListener('click', () => {
    delete edits().steps[id];
    commit('Step restored');
    back();
  });

  q('[data-save]').addEventListener('click', () => {
    const next = {};
    const product = q('[data-product]').value.trim();
    if (product && product !== base.product) next.product = product;
    if (seasonal) {
      const summer = q('[data-p-summer]').value.trim();
      const winter = q('[data-p-winter]').value.trim();
      const bs = base.portion.summer ?? base.portion.all;
      const bw = base.portion.winter ?? base.portion.all;
      if ((summer && summer !== bs) || (winter && winter !== bw)) next.portion = { summer: summer || bs, winter: winter || bw };
    } else {
      const all = q('[data-p-all]').value.trim();
      if (all && all !== portionText(base.portion)) next.portion = { all };
    }
    const how = q('[data-how]').value.trim();
    if (how && how !== (base.how || '')) next.how = how;
    if (!q('[data-use]').checked) next.off = true;

    const all = edits().steps;
    all[id] = next;
    // Same product elsewhere: carry the new name across, only if the name was changed just now
    const nameChanged = product && product !== cur.product;
    if (q('[data-everywhere]')?.checked && nameChanged) {
      for (const { st } of sameProduct) {
        const other = (all[st.id] ??= {});
        if (next.product) other.product = next.product;
        else delete other.product;
      }
    }
    commit('Saved');
    back();
  });
}

// ---------- Add or edit a step of your own ----------
const AREAS = ['Face', 'Face & neck', 'Under-eyes', 'Lips', 'Body', 'Arms & feet'];
const WAITS = [0, 15, 30, 45, 60, 90, 120, 180, 300];
const waitLabel = (v) => (v === 0 ? 'No wait' : v < 60 ? `${v} seconds` : v % 60 ? `${Math.floor(v / 60)} min ${v % 60} s` : `${v / 60} min`);

const ACTIVE = /\b(acid|aha|bha|pha|glycolic|lactic|mandelic|salicylic|kojic|vitamin c|ascorbic|peel|exfoliat|retinol|retinal|retinoid|tretinoin|adapalene|benzoyl)\b/i;
const SUNSCREEN = /sunscreen|spf|sun cream|sunblock/i;

function addedWarning(rid, product, afterId, steps) {
  const warnings = [];
  if (product && ACTIVE.test(product)) {
    if (rid === 'retinal') warnings.push('Acids, exfoliants or a second retinoid on a retinal night can irritate. Your plan keeps them on separate nights.');
    if (rid === 'preGym') warnings.push('Your plan avoids acid products before exercise, when skin is warm and sweaty.');
  }
  if ((rid === 'preGym' || rid === 'postGym') && product && !SUNSCREEN.test(product)) {
    const idx = afterId === '__start' ? -1 : steps.findIndex((x) => x.id === afterId);
    if (idx >= 0 && SUNSCREEN.test(steps[idx].product) && steps.slice(idx + 1).every((x) => !SUNSCREEN.test(x.product) || x.only)) {
      warnings.push('Sunscreen usually goes last in the morning, so it isn’t disturbed. Consider putting this before it.');
    }
  }
  return warnings;
}

function showAdded(host, rid, sid, close) {
  const e = edits();
  e.added ??= {};
  const list = (e.added[rid] ??= []);
  const existing = sid ? list.find((a) => a.id === sid) : null;
  const routine = ROUTINES[rid];
  const others = routine.steps.filter((x) => x.id !== sid);

  // Default position: after the last step, or just before sunscreen in the morning
  let defAfter = others.length ? others[others.length - 1].id : '__start';
  const sunIdx = others.findIndex((x) => SUNSCREEN.test(x.product) && !x.only);
  if (!existing && (rid === 'preGym' || rid === 'postGym') && sunIdx >= 0) defAfter = sunIdx === 0 ? '__start' : others[sunIdx - 1].id;
  const after = existing?.after ?? defAfter;

  host.innerHTML = `
    <header class="sheet-head"><button class="link-btn" data-ed-back>‹ Back</button><button class="link-btn" data-ed-save>${existing ? 'Save' : 'Add'}</button></header>
    <h2 class="h2">${existing ? esc(existing.product) : `New step in ${esc(routine.name)}`}</h2>

    <label class="field">Product
      <input type="text" data-ed-product value="${esc(existing?.product || '')}" placeholder="e.g. Hyaluronic acid serum" autocomplete="off">
    </label>
    <label class="field">Where it goes
      <input type="text" data-ed-area list="ed-areas" value="${esc(existing?.area || 'Face')}" autocomplete="off">
      <datalist id="ed-areas">${AREAS.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>
    </label>
    <label class="field">Amount
      <input type="text" data-ed-portion value="${esc(existing?.portion?.all || '')}" placeholder="e.g. 2 drops" autocomplete="off">
    </label>
    <label class="field">How to apply (optional)
      <textarea rows="2" data-ed-how placeholder="e.g. Pat gently onto damp skin">${esc(existing?.how || '')}</textarea>
    </label>
    <label class="field">Position
      <select data-ed-after>
        <option value="__start" ${after === '__start' ? 'selected' : ''}>First step</option>
        ${others.map((x) => `<option value="${x.id}" ${x.id === after ? 'selected' : ''}>After ${esc(x.product)}</option>`).join('')}
      </select>
    </label>
    <div class="dry-pair">
      <label class="field">Drying time after
        <select data-ed-wait>${WAITS.map((v) => `<option value="${v}" ${v === (existing?.wait || 0) ? 'selected' : ''}>${waitLabel(v)}</option>`).join('')}</select>
      </label>
      <label class="field">When to use it
        <select data-ed-only>
          <option value="" ${!existing?.only ? 'selected' : ''}>All year</option>
          <option value="summer" ${existing?.only === 'summer' ? 'selected' : ''}>Summer only</option>
          <option value="winter" ${existing?.only === 'winter' ? 'selected' : ''}>Winter only</option>
        </select>
      </label>
    </div>
    <div class="ed-warnings" aria-live="polite"></div>
    <p class="muted small">Not sure where it goes? Ask in the Ask tab before adding it.</p>
    ${existing ? '<div class="row-actions"><button class="ghost danger" data-ed-delete>Remove this step</button></div>' : ''}`;

  const q = (s) => host.querySelector(s);
  const back = () => showOverview(host, close);
  const check = () => {
    const w = addedWarning(rid, q('[data-ed-product]').value.trim(), q('[data-ed-after]').value, others);
    q('.ed-warnings').innerHTML = w.map((t) => `<p class="ed-warn">${esc(t)}</p>`).join('');
  };
  q('[data-ed-product]').addEventListener('input', check);
  q('[data-ed-after]').addEventListener('change', check);
  check();
  q('[data-ed-back]').addEventListener('click', back);
  if (!existing) q('[data-ed-product]').focus();

  q('[data-ed-delete]')?.addEventListener('click', () => {
    if (!confirm(`Remove ${existing.product} from ${routine.name}?`)) return;
    // Anything placed after this step moves up to its spot
    for (const a of list) if (a.after === existing.id) a.after = existing.after;
    e.added[rid] = list.filter((a) => a.id !== existing.id);
    commit('Step removed');
    back();
  });

  q('[data-ed-save]').addEventListener('click', () => {
    const product = q('[data-ed-product]').value.trim();
    if (!product) {
      toast('Add a product name first.');
      q('[data-ed-product]').focus();
      return;
    }
    const step = {
      id: existing?.id || 'u-' + crypto.randomUUID().slice(0, 8),
      product,
      area: q('[data-ed-area]').value.trim(),
      portion: { all: q('[data-ed-portion]').value.trim() },
      how: q('[data-ed-how]').value.trim(),
      wait: +q('[data-ed-wait]').value || 0,
      only: q('[data-ed-only]').value || undefined,
      after: q('[data-ed-after]').value,
    };
    if (existing) Object.assign(existing, step);
    else list.push(step);
    commit(existing ? 'Saved' : `${product} added`);
    back();
  });
}
