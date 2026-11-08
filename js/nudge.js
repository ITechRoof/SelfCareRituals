// Tells the buddy-nudge server the date of your latest routine, and registers
// this phone for notifications. Sends only your user code, key and a date.
import { NUDGE_SERVER } from './config.js';
import { ACCOUNT } from './plan.js';
import { state, currentUser } from './store.js';

export const nudgesEnabled = () => !!(NUDGE_SERVER && ACCOUNT?.key);

async function post(path, body) {
  const res = await fetch(NUDGE_SERVER.replace(/\/$/, '') + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uid: currentUser(), key: ACCOUNT.key, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `server said ${res.status}`);
  return data;
}

// active = you just did a routine today, so your buddies may get a nudge.
export async function checkin(active = false) {
  if (!nudgesEnabled()) return;
  const last = state.logs.reduce((m, l) => (l.date > m ? l.date : m), '');
  if (!last) return;
  try {
    await post('/checkin', { last, active });
  } catch {}
}

export async function registerPush(subscription) {
  if (!nudgesEnabled()) return false;
  await post('/subscribe', { subscription });
  return true;
}

export async function testPush() {
  return post('/test', {});
}
