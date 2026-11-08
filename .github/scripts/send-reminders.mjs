// Sends web push reminders listed in reminders.json.
// Runs from .github/workflows/reminders.yml every 15 minutes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import webpush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SUBSCRIPTION, TEST_PUSH } = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) {
  console.log('Push secrets are not set yet. Nothing to send.');
  process.exit(0);
}

// ---- Sanity checks, so problems show up clearly in the log ----
const pub = VAPID_PUBLIC_KEY.trim();
const priv = VAPID_PRIVATE_KEY.trim();
const subject = (VAPID_SUBJECT || '').trim();
let setupOk = true;

try {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(priv, 'base64url'));
  if (ecdh.getPublicKey().toString('base64url') !== pub) {
    console.error('✗ VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not a matching pair (from different generate runs?).');
    console.error('  Generate one new pair and update both secrets AND js/config.js.');
    setupOk = false;
  } else console.log('✓ VAPID keys are a matching pair.');
} catch {
  console.error('✗ VAPID_PRIVATE_KEY is not a valid key. Paste it again, without spaces or line breaks.');
  setupOk = false;
}
if (!/^mailto:[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/i.test(subject) && !/^https:\/\/\S+$/.test(subject)) {
  console.error(`✗ VAPID_SUBJECT must look exactly like mailto:you@gmail.com (no spaces). It is: "${subject}"`);
  setupOk = false;
} else console.log('✓ VAPID_SUBJECT looks right.');
if (!setupOk) process.exit(1);

webpush.setVapidDetails(subject, pub, priv);

const parsed = JSON.parse(PUSH_SUBSCRIPTION);
const subscriptions = Array.isArray(parsed) ? parsed : [parsed];
const cfg = JSON.parse(fs.readFileSync('reminders.json', 'utf8'));

const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: cfg.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .map((p) => [p.type, p.value])
);
const nowMin = +parts.hour * 60 + +parts.minute;
const windowMin = cfg.windowMinutes || 15;
console.log(`Local time ${parts.weekday} ${parts.hour}:${parts.minute} (${cfg.timezone})`);

let due = cfg.reminders.filter((r) => {
  if (!r.days.includes(parts.weekday)) return false;
  const [h, m] = r.time.split(':').map(Number);
  const t = h * 60 + m;
  return nowMin >= t && nowMin < t + windowMin;
});

if (TEST_PUSH === 'true') {
  due = [{ title: 'Skin Ritual', body: 'Test notification. Reminders are working.', url: './' }];
}

for (const r of due) {
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.title }));
      console.log(`Sent: ${r.title}`);
    } catch (err) {
      console.error(`Failed: ${r.title}: ${err.statusCode || ''} ${err.body || err.message}`);
      process.exitCode = 1; // show the run as failed (red), not green
      if (/VapidPkHashMismatch/.test(err.body || '')) {
        console.error('The phone subscribed with a different public key. Turn notifications on again in the app and update PUSH_SUBSCRIPTION.');
      }
      if (/BadJwtToken/.test(err.body || '')) {
        console.error('Apple rejected the signature. Check the key pair and VAPID_SUBJECT checks above.');
      }
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.error('This subscription has expired. Turn notifications on again in the app and update the secret.');
      }
    }
  }
}
if (!due.length) console.log('No reminders due right now.');
