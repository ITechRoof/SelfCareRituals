// Encrypts one person's routine for the app.
//
//   node tools/encrypt-plan.mjs <name>
//
// Reads private/<name>.mjs and writes plans/<id>.enc.json, where <id> is a
// hash of the name (so the repo doesn't show who uses the app).
// <name> is what that person types in the Name box when signing in.
// Only plans/ goes to GitHub. The private/ folder stays on your Mac.

import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';

const ITERATIONS = 600000;
const root = new URL('../', import.meta.url);
const name = (process.argv[2] || '').trim();

if (!name) {
  const people = fs.existsSync(new URL('private/', root))
    ? fs.readdirSync(new URL('private/', root)).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, ''))
    : [];
  console.log('Usage: node tools/encrypt-plan.mjs <name>');
  console.log(people.length ? `Routines found in private/: ${people.join(', ')}` : 'No routines found in private/ yet.');
  process.exit(1);
}

const file = new URL(`private/${name.toLowerCase()}.mjs`, root);
if (!fs.existsSync(file)) {
  console.error(`Can't find private/${name.toLowerCase()}.mjs. Copy an existing routine to start one, e.g.:`);
  console.error(`  cp private/me.mjs private/${name.toLowerCase()}.mjs`);
  process.exit(1);
}
const { routines, text, profile = {} } = await import(file);

// Each person gets a random private key for the buddy-nudge server.
// Kept in private/.keys.json, and inside their encrypted routine.
const keysFile = new URL('private/.keys.json', root);
const keys = fs.existsSync(keysFile) ? JSON.parse(fs.readFileSync(keysFile, 'utf8')) : {};
const login = name.toLowerCase();
keys[login] ??= Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2) + '\n');
const account = { key: keys[login], displayName: profile.displayName || name[0].toUpperCase() + name.slice(1) };

export async function userId(n) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('skin-ritual:' + n.trim().toLowerCase())));
  return [...hash.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes('\n') || s.includes('\r')) process.stdout.write('\n');
    };
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

let pass = process.env.PLAN_PASSPHRASE;
if (!pass) {
  pass = await askHidden(`Choose a passphrase for "${name}": `);
  const again = await askHidden('Type it again: ');
  if (pass !== again) {
    console.error('The two passphrases did not match. Nothing was changed.');
    process.exit(1);
  }
}
if (pass.length < 12) {
  console.error('Please use at least 12 characters. Four random words works well, e.g. "lantern cobalt mango drift".');
  process.exit(1);
}

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ routines, text, account }))));
await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data); // check before writing

const b64 = (u) => Buffer.from(u).toString('base64');
const id = await userId(name);
fs.mkdirSync(new URL('plans/', root), { recursive: true });
const out = new URL(`plans/${id}.enc.json`, root);
fs.writeFileSync(out, JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }, null, 2) + '\n');

console.log(`Done. "${name}" signs in with that passphrase.`);
console.log(`If you use buddy nudges and this is a new person, also run: node tools/nudge-users.mjs`);
console.log(`Upload it with:`);
console.log(`  git add plans/${id}.enc.json && git commit -m "Update routine" && git push`);
