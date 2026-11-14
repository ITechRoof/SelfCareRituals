// Sends web push reminders listed in reminders.json.
// Runs from .github/workflows/reminders.yml every 15 minutes.
import fs from 'node:fs';
import webpush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SUBSCRIPTION, TEST_PUSH } = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) {
  console.log('Push secrets are not set yet. Nothing to send.');
  process.exit(0);
}

webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:you@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.error('This subscription has expired. Turn notifications on again in the app and update the secret.');
      }
    }
  }
}
if (!due.length) console.log('No reminders due right now.');
