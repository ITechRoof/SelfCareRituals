// Builds the user list for the buddy-nudge server from everyone in private/.
//
//   node tools/nudge-users.mjs
//
// Writes private/worker-users.json and prints the command that uploads it.
// Run it again after adding a person or changing anyone's `profile`.

import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const keysFile = new URL('private/.keys.json', root);
const keys = fs.existsSync(keysFile) ? JSON.parse(fs.readFileSync(keysFile, 'utf8')) : {};

const sha = async (s) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex');
const uidOf = async (n) => (await sha('skin-ritual:' + n.trim().toLowerCase())).slice(0, 20);

const people = fs.readdirSync(new URL('private/', root)).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '').toLowerCase());
const users = {};
const lines = [];
let problems = 0;

for (const login of people) {
  const { profile = {} } = await import(new URL(`private/${login}.mjs`, root));
  if (!keys[login]) {
    console.log(`! ${login}: not encrypted yet. Run: node tools/encrypt-plan.mjs ${login}`);
    problems++;
    continue;
  }
  const buddies = (profile.buddies || []).map((b) => b.toLowerCase());
  for (const b of buddies) if (!people.includes(b)) console.log(`! ${login}: buddy "${b}" has no routine in private/, so they won't be nudged.`);
  users[await uidOf(login)] = {
    name: profile.displayName || login[0].toUpperCase() + login.slice(1),
    keyHash: await sha(keys[login]),
    buddies: await Promise.all(buddies.filter((b) => people.includes(b)).map(uidOf)),
    nudgeAfterDays: profile.nudgeAfterDays || 3,
  };
  lines.push(`  ${login}: encourages ${buddies.length ? buddies.join(', ') : 'nobody'}; gets nudged after ${profile.nudgeAfterDays || 3} missed days`);
}

fs.writeFileSync(new URL('private/worker-users.json', root), JSON.stringify(users) + '\n');
console.log(lines.join('\n'));
console.log(`\nWrote private/worker-users.json (${Object.keys(users).length} people). Upload it to the server with:`);
console.log('  cd worker && npx wrangler secret put USERS < ../private/worker-users.json && cd ..');
if (problems) process.exitCode = 1;
