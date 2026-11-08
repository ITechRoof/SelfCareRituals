// Adds someone's phone to the GitHub reminders.
//
// When someone sends you their "Skin Ritual notification address" message:
//   1. Copy the whole message on your Mac.
//   2. In the project folder run:   pbpaste | node tools/add-subscription.mjs
//
// It keeps everyone's address in private/subscriptions.json (never uploaded)
// and updates the PUSH_SUBSCRIPTION secret on GitHub with all of them.
//
// Other commands:
//   node tools/add-subscription.mjs --list           who is subscribed
//   node tools/add-subscription.mjs --remove priya   take someone off
//   node tools/add-subscription.mjs --upload         push the list to GitHub again

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const file = new URL('../private/subscriptions.json', import.meta.url);
const subs = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const save = () => {
  fs.mkdirSync(new URL('../private/', import.meta.url), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(subs, null, 2) + '\n');
};

function upload() {
  const value = JSON.stringify(Object.values(subs));
  if (!Object.keys(subs).length) return console.log('Nobody is subscribed yet, so nothing to upload.');
  try {
    execFileSync('gh', ['secret', 'set', 'PUSH_SUBSCRIPTION', '--body', value], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`✓ GitHub secret PUSH_SUBSCRIPTION updated (${Object.keys(subs).length} phone${Object.keys(subs).length > 1 ? 's' : ''}).`);
    console.log('  Test it: Actions tab > Skincare reminders > Run workflow');
  } catch (e) {
    const why = e.code === 'ENOENT' ? 'the GitHub CLI (gh) is not installed' : (e.stderr?.toString().trim() || e.message);
    console.log(`Couldn't update GitHub automatically (${why}).`);
    console.log('Paste this as the PUSH_SUBSCRIPTION secret instead:\n');
    console.log(value);
  }
}

const args = process.argv.slice(2);

if (args[0] === '--list') {
  const names = Object.keys(subs);
  console.log(names.length ? `Subscribed: ${names.join(', ')}` : 'Nobody yet.');
  process.exit(0);
}
if (args[0] === '--remove') {
  const who = (args[1] || '').toLowerCase();
  if (!subs[who]) {
    console.log(`"${args[1]}" isn't in the list. Try --list.`);
    process.exit(1);
  }
  delete subs[who];
  save();
  console.log(`Removed ${who}.`);
  upload();
  process.exit(0);
}
if (args[0] === '--upload') {
  upload();
  process.exit(0);
}

// Read the pasted message
let text = '';
if (!process.stdin.isTTY) text = fs.readFileSync(0, 'utf8');
if (!text.trim()) {
  console.log('Copy the message you received first, then run:  pbpaste | node tools/add-subscription.mjs');
  process.exit(1);
}

let name, sub;
const m = text.match(/SR1\.([A-Za-z0-9_\-\s]+)/);
if (m) {
  try {
    const payload = JSON.parse(Buffer.from(m[1].replace(/\s+/g, ''), 'base64url').toString('utf8'));
    name = payload.n;
    sub = payload.s;
  } catch {
    console.log('The code in that message looks incomplete. Ask them to send it again, or copy the whole message.');
    process.exit(1);
  }
} else {
  // Older style: the raw address text, plus --name
  const j = text.match(/\{[\s\S]*"endpoint"[\s\S]*\}/);
  const n = args.indexOf('--name');
  if (j && n >= 0) {
    sub = JSON.parse(j[0]);
    name = args[n + 1];
  } else {
    console.log("Couldn't find a Skin Ritual address in what you copied. Copy the whole message and try again.");
    process.exit(1);
  }
}

if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) {
  console.log('That address is incomplete. Ask them to send it again.');
  process.exit(1);
}

const key = String(name || 'someone').trim().toLowerCase();
const replaced = !!subs[key];
subs[key] = sub;
save();
console.log(`${replaced ? 'Updated' : 'Added'} ${name}'s phone.`);
upload();
