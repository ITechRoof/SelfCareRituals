import { allPhotos, putPhoto, deletePhoto } from './store.js';
import { $, esc, fmtDate, toast } from './util.js';

export const AREAS = [
  { id: 'face', name: 'Face', cam: 'user' },
  { id: 'left', name: 'Left side', cam: 'user' },
  { id: 'right', name: 'Right side', cam: 'user' },
  { id: 'eyes', name: 'Under-eyes', cam: 'user' },
  { id: 'arms', name: 'Arms', cam: 'environment' },
  { id: 'feet', name: 'Feet', cam: 'environment' },
];

let area = 'face';
const urls = new Map();
const urlFor = (p) => {
  if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
  return urls.get(p.id);
};

export async function renderPhotos(el) {
  const all = await allPhotos();
  const mine = all.filter((p) => p.area === area);
  const areaName = AREAS.find((a) => a.id === area).name;

  el.innerHTML = `
    <section class="hero">
      <p class="eyebrow-date">${all.length} photo${all.length === 1 ? '' : 's'} saved on this phone</p>
      <h1 class="display">Progress photos</h1>
    </section>
    <div class="chips" role="tablist">${AREAS.map(
      (a) => `<button class="chip" role="tab" aria-selected="${a.id === area}" data-area="${a.id}">${a.name}</button>`
    ).join('')}</div>
    <div class="row-actions">
      <button class="primary" data-take>Take ${esc(areaName.toLowerCase())} photo</button>
      ${mine.length >= 2 ? '<button class="ghost" data-compare>Compare</button>' : ''}
    </div>
    <p class="muted small">Same spot, same light, same time of day makes changes easier to see. Your last photo shows faintly over the camera to help line up.</p>
    ${
      mine.length
        ? `<div class="gallery">${[...mine]
            .reverse()
            .map(
              (p) => `<button class="thumb" data-id="${p.id}">
                <img src="${urlFor(p)}" alt="${esc(areaName)} on ${fmtDate(new Date(p.takenAt))}" loading="lazy">
                <span>${fmtDate(new Date(p.takenAt))}</span></button>`
            )
            .join('')}</div>`
        : `<p class="empty">No ${esc(areaName.toLowerCase())} photos yet. Take one today as your starting point.</p>`
    }`;

  el.querySelectorAll('[data-area]').forEach((b) =>
    b.addEventListener('click', () => {
      area = b.dataset.area;
      renderPhotos(el);
    })
  );
  el.querySelector('[data-take]').addEventListener('click', () => openCamera(mine.at(-1), () => renderPhotos(el)));
  el.querySelector('[data-compare]')?.addEventListener('click', () => openCompare(mine));
  el.querySelectorAll('.thumb').forEach((t) =>
    t.addEventListener('click', () => openPhoto(mine.find((p) => p.id === t.dataset.id), () => renderPhotos(el)))
  );
}

export function setPhotoArea(a) {
  if (AREAS.some((x) => x.id === a)) area = a;
}

// ---------- Sheet helpers ----------
function sheet(html) {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-card full">${html}</div>`;
  s.hidden = false;
  document.body.classList.add('sheet-open');
  return s;
}
function closeSheet() {
  const s = $('#sheet');
  s.hidden = true;
  s.innerHTML = '';
  document.body.classList.remove('sheet-open');
}

// ---------- Camera ----------
async function openCamera(last, onSaved) {
  const meta = AREAS.find((a) => a.id === area);
  let facing = meta.cam;
  let stream = null;

  const s = sheet(`
    <header class="sheet-head"><h2 class="h2">${esc(meta.name)}</h2><button class="link-btn" data-cancel>Cancel</button></header>
    <div class="cam">
      <video playsinline autoplay muted></video>
      ${last ? `<img class="ghost-img" src="${urlFor(last)}" alt="">` : ''}
      <p class="cam-msg" hidden></p>
    </div>
    ${last ? '<label class="ghost-ctl">Previous photo overlay <input type="range" min="0" max="70" value="30" data-ghost></label>' : ''}
    <div class="row-actions center">
      <button class="ghost" data-flip>Flip</button>
      <button class="shutter" data-snap aria-label="Take photo"></button>
      <label class="ghost file-btn">Library<input type="file" accept="image/*" data-file hidden></label>
    </div>`);

  const video = s.querySelector('video');
  const ghost = s.querySelector('.ghost-img');
  const msg = s.querySelector('.cam-msg');

  const stop = () => stream?.getTracks().forEach((t) => t.stop());
  const start = async () => {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } },
        audio: false,
      });
      video.srcObject = stream;
      video.classList.toggle('mirror', facing === 'user');
      msg.hidden = true;
    } catch {
      msg.hidden = false;
      msg.textContent = 'Camera access is off. Allow the camera in Settings, or pick a photo from your library.';
    }
  };
  await start();

  s.querySelector('[data-ghost]')?.addEventListener('input', (e) => (ghost.style.opacity = e.target.value / 100));
  if (ghost) ghost.style.opacity = 0.3;
  s.querySelector('[data-cancel]').addEventListener('click', () => {
    stop();
    closeSheet();
  });
  s.querySelector('[data-flip]').addEventListener('click', () => {
    facing = facing === 'user' ? 'environment' : 'user';
    start();
  });

  const saveBlob = async (blob, w, h) => {
    await putPhoto({ id: crypto.randomUUID(), area, takenAt: Date.now(), blob, w, h });
    stop();
    closeSheet();
    toast('Photo saved');
    onSaved();
  };

  s.querySelector('[data-snap]').addEventListener('click', () => {
    if (!video.videoWidth) return;
    const { canvas, w, h } = drawScaled(video, video.videoWidth, video.videoHeight, facing === 'user');
    canvas.toBlob((b) => saveBlob(b, w, h), 'image/jpeg', 0.85);
  });

  s.querySelector('[data-file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = await createImageBitmap(file);
    const { canvas, w, h } = drawScaled(img, img.width, img.height, false);
    canvas.toBlob((b) => saveBlob(b, w, h), 'image/jpeg', 0.85);
  });
}

function drawScaled(src, sw, sh, mirror) {
  const max = 1440;
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, 0, 0, w, h);
  return { canvas, w, h };
}

// ---------- Single photo ----------
function openPhoto(p, onChange) {
  const s = sheet(`
    <header class="sheet-head"><h2 class="h2">${fmtDate(new Date(p.takenAt))}</h2><button class="link-btn" data-cancel>Close</button></header>
    <img class="photo-full" src="${urlFor(p)}" alt="">
    <div class="row-actions"><button class="ghost danger" data-del>Delete photo</button></div>`);
  s.querySelector('[data-cancel]').addEventListener('click', closeSheet);
  s.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm('Delete this photo?')) return;
    await deletePhoto(p.id);
    closeSheet();
    onChange();
  });
}

// ---------- Compare ----------
function openCompare(list) {
  let a = list[0];
  let b = list.at(-1);
  const opts = (sel) =>
    list.map((p) => `<option value="${p.id}" ${p.id === sel.id ? 'selected' : ''}>${fmtDate(new Date(p.takenAt))}</option>`).join('');

  const s = sheet(`
    <header class="sheet-head"><h2 class="h2">Before and after</h2><button class="link-btn" data-cancel>Close</button></header>
    <div class="compare-pick">
      <label>Before <select data-a>${opts(a)}</select></label>
      <label>After <select data-b>${opts(b)}</select></label>
    </div>
    <div class="compare">
      <img class="cmp-a" alt="Before">
      <div class="cmp-b-wrap"><img class="cmp-b" alt="After"></div>
      <div class="cmp-handle" aria-hidden="true"></div>
    </div>
    <input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="Slide between before and after">`);

  const imgA = s.querySelector('.cmp-a');
  const imgB = s.querySelector('.cmp-b');
  const wrap = s.querySelector('.cmp-b-wrap');
  const handle = s.querySelector('.cmp-handle');
  const range = s.querySelector('.cmp-range');
  const set = () => {
    imgA.src = urlFor(a);
    imgB.src = urlFor(b);
  };
  const slide = () => {
    wrap.style.clipPath = `inset(0 0 0 ${range.value}%)`;
    handle.style.left = `${range.value}%`;
  };
  set();
  slide();
  range.addEventListener('input', slide);
  s.querySelector('[data-a]').addEventListener('change', (e) => {
    a = list.find((p) => p.id === e.target.value);
    set();
  });
  s.querySelector('[data-b]').addEventListener('change', (e) => {
    b = list.find((p) => p.id === e.target.value);
    set();
  });
  s.querySelector('[data-cancel]').addEventListener('click', closeSheet);
}

export { closeSheet, sheet };
