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
  return Object.keys(e.steps || {}).length + (Array.isArray(e.retinalDays) ? 1 : 0);
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
              (st) => `<li><button class="ed-step ${st.off ? 'is-off' : ''}" data-step="${st.id}">
                <span class="ed-name">${esc(st.product)}${st.only ? ` <span class="ed-tag">${st.only} only</span>` : ''}</span>
                <span class="ed-meta">${st.off ? 'Turned off' : esc(portionText(st.portion))}</span>
                ${st.edited ? '<span class="ed-badge">Changed</span>' : ''}
              </button></li>`
            )
            .join('')}</ul>
        </section>`;
      })
      .join('')}
    ${editCount() ? '<div class="row-actions"><button class="ghost danger" data-reset-all>Undo all my changes</button></div>' : ''}`;

  host.querySelector('[data-close]').addEventListener('click', close);
  host.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => showStep(host, b.dataset.step, close)));
  host.querySelector('[data-reset-all]')?.addEventListener('click', () => {
    if (!confirm('Undo all your changes and go back to your original routine?')) return;
    state.settings.routineEdits = { steps: {} };
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
