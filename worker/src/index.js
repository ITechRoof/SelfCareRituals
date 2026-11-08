// Skin Ritual buddy nudges: a tiny Cloudflare Worker.
//
// Phones send:   POST /subscribe  { uid, key, subscription }   their push address
//                POST /checkin    { uid, key, last, active }    date of their latest routine
//                POST /test       { uid, key }                  sends themselves a test push
// When someone finishes a routine (active: true), each of their buddies who has
// missed `nudgeAfterDays` days gets one encouraging push, at most once per
// NUDGE_COOLDOWN_DAYS, and never in quiet hours.
//
// Stored per user (KV): push subscription, last routine date, last nudge date. Nothing else.

const te = new TextEncoder();

const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)),
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) out.set(p, (i += p.length) - p.length);
  return out;
};
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const MESSAGES = [
  (d, n) => `You haven’t done your routine for ${d} days. Keep up with ${n} to maintain your glow ✨`,
  (d, n) => `${n} just finished their routine. It’s been ${d} days for you. Join in today? 💧`,
  (d, n) => `${d} days since your last routine. ${n} is keeping their streak going. Your skin will thank you for catching up 🌿`,
];

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ ok: true, service: 'skin-ritual-nudges' });

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad request' }, 400);
    }
    const users = JSON.parse(env.USERS || '{}');
    const me = users[body.uid];
    if (!me || typeof body.key !== 'string' || hex(await crypto.subtle.digest('SHA-256', te.encode(body.key))) !== me.keyHash) {
      return json({ error: 'unauthorised' }, 401);
    }
    const path = new URL(req.url).pathname;

    if (path === '/subscribe') {
      const sub = body.subscription;
      if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: 'bad subscription' }, 400);
      await env.NUDGES.put(`sub:${body.uid}`, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }));
      return json({ ok: true });
    }

    if (path === '/checkin') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.last || '')) return json({ error: 'bad date' }, 400);
      const prev = await env.NUDGES.get(`last:${body.uid}`);
      if (!prev || body.last > prev) await env.NUDGES.put(`last:${body.uid}`, body.last);
      let nudged = 0;
      if (body.active) {
        for (const b of me.buddies || []) if (await maybeNudge(env, users, b, me.name)) nudged++;
      }
      return json({ ok: true, nudged });
    }

    if (path === '/test') {
      const sub = await env.NUDGES.get(`sub:${body.uid}`);
      if (!sub) return json({ error: 'no subscription yet' }, 404);
      const status = await sendPush(env, JSON.parse(sub), { title: 'Skin Ritual', body: 'Test notification. Buddy nudges are working.', url: './' });
      return json({ ok: status < 300, status });
    }

    return json({ error: 'not found' }, 404);
  },
};

function localNow(tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

async function maybeNudge(env, users, uid, fromName) {
  const buddy = users[uid];
  if (!buddy) return false;
  const now = localNow(env.TIMEZONE || 'Europe/London');
  const quietStart = +(env.QUIET_START ?? 21);
  const quietEnd = +(env.QUIET_END ?? 8);
  if (now.hour >= quietStart || now.hour < quietEnd) return false;

  const last = await env.NUDGES.get(`last:${uid}`);
  if (!last) return false; // never used the app: don't nag
  const missed = daysBetween(last, now.date);
  if (missed < (buddy.nudgeAfterDays || 3)) return false;

  const lastNudge = await env.NUDGES.get(`nudged:${uid}`);
  if (lastNudge && daysBetween(lastNudge, now.date) < +(env.NUDGE_COOLDOWN_DAYS ?? 3)) return false;

  const sub = await env.NUDGES.get(`sub:${uid}`);
  if (!sub) return false;

  const pick = MESSAGES[daysBetween('2024-01-01', now.date) % MESSAGES.length];
  const status = await sendPush(env, JSON.parse(sub), { title: 'Skin Ritual', body: pick(missed, fromName), url: './?start=1', tag: 'buddy-nudge' });
  if (status === 0 || status === 404 || status === 410) await env.NUDGES.delete(`sub:${uid}`); // unusable or unsubscribed
  if (status >= 300) return false;
  await env.NUDGES.put(`nudged:${uid}`, now.date);
  return true;
}

// ---------- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) ----------
async function vapidHeader(env, endpoint) {
  const pub = b64u.dec(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const head = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(
    te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:admin@example.com' }))
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function hkdf(salt, ikm, info, length) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, length * 8));
}

export async function encryptPayload(sub, payload) {
  const uaPublic = b64u.dec(sub.keys.p256dh);
  const authSecret = b64u.dec(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(te.encode(payload), new Uint8Array([2])); // 0x02 = last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// Returns the push service's HTTP status, or 0 if the subscription is unusable.
export async function sendPush(env, sub, message) {
  try {
    return await deliver(env, sub, message);
  } catch (e) {
    console.log('push failed', e?.message);
    return 0;
  }
}

async function deliver(env, sub, message) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: await encryptPayload(sub, JSON.stringify(message)),
  });
  return res.status;
}
