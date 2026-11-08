// Sign-in for each user. Every user has their own encrypted routine at
// plans/<user id>.enc.json, where the id is a hash of their login name, so the
// repo doesn't reveal names. AES-256-GCM with a PBKDF2-SHA256 key from the passphrase.
// "Stay unlocked" keeps the derived key on this phone (IndexedDB, non-extractable).

const DB = 'skin-ritual-lock';

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function keyOp(mode, fn) {
  const d = await idb();
  return new Promise((resolve) => {
    const t = d.transaction('k', mode);
    const req = fn(t.objectStore('k'));
    t.oncomplete = () => resolve(req?.result ?? null);
    t.onerror = () => resolve(null);
  });
}
const getSession = () => keyOp('readonly', (s) => s.get('session')).catch(() => null);
const putSession = (v) => keyOp('readwrite', (s) => s.put(v, 'session')).catch(() => null);
const delSession = () => keyOp('readwrite', (s) => s.delete('session')).catch(() => null);

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Same calculation as tools/encrypt-plan.mjs
export async function userId(name) {
  const data = new TextEncoder().encode('skin-ritual:' + name.trim().toLowerCase());
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchBlob(uid) {
  let res;
  try {
    res = await fetch(`plans/${uid}.enc.json`, { cache: 'no-cache' });
  } catch {
    throw new Error('offline');
  }
  if (!res.ok) throw new Error('wrong'); // unknown name: same message as a wrong passphrase
  return res.json();
}

async function deriveKey(passphrase, blob) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(blob.salt), iterations: blob.iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decrypt(key, blob) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

// Signs back in with the session saved on this phone. Returns { uid, name, plan } or null.
export async function autoUnlock() {
  const s = await getSession();
  if (!s?.key || !s.uid) return null;
  try {
    return { uid: s.uid, name: s.name, plan: await decrypt(s.key, await fetchBlob(s.uid)) };
  } catch (e) {
    if (e.message !== 'offline') await delSession(); // passphrase changed or user removed
    return null;
  }
}

export async function unlock(name, passphrase, remember) {
  const uid = await userId(name);
  const blob = await fetchBlob(uid);
  const key = await deriveKey(passphrase, blob);
  let plan;
  try {
    plan = await decrypt(key, blob);
  } catch {
    throw new Error('wrong');
  }
  const display = name.trim();
  if (remember) await putSession({ uid, key, name: display });
  return { uid, name: display, plan };
}

export async function lockNow() {
  await delSession();
}
