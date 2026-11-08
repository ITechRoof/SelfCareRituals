// Unlocks the encrypted routine (plan.enc.json) with your passphrase.
// AES-256-GCM, key derived with PBKDF2-SHA256. The derived key can be kept
// on this phone (IndexedDB, non-extractable) so you don't retype it each time.

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
const getKey = () => keyOp('readonly', (s) => s.get('key')).catch(() => null);
const putKey = (k) => keyOp('readwrite', (s) => s.put(k, 'key')).catch(() => null);
const delKey = () => keyOp('readwrite', (s) => s.delete('key')).catch(() => null);

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class MissingPlanError extends Error {}

async function fetchBlob() {
  let res;
  try {
    res = await fetch('plan.enc.json', { cache: 'no-cache' });
  } catch {
    throw new Error('offline');
  }
  if (!res.ok) throw new MissingPlanError('plan.enc.json not found');
  return res.json();
}

async function deriveKey(passphrase, blob) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey']
  );
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

// Uses the key saved on this phone, if any. Returns the plan or null.
export async function autoUnlock() {
  const key = await getKey();
  if (!key) return null;
  try {
    return await decrypt(key, await fetchBlob());
  } catch (e) {
    if (e instanceof MissingPlanError) throw e;
    if (e.message !== 'offline') await delKey(); // passphrase was changed
    return null;
  }
}

export async function unlock(passphrase, remember) {
  const blob = await fetchBlob();
  const key = await deriveKey(passphrase, blob);
  let plan;
  try {
    plan = await decrypt(key, blob);
  } catch {
    throw new Error('wrong');
  }
  if (remember) await putKey(key);
  return plan;
}

export async function lockNow() {
  await delKey();
}
