// Encrypts plan.private.mjs into plan.enc.json with your passphrase.
// Usage (from the project folder):  node tools/encrypt-plan.mjs
// Only plan.enc.json goes to GitHub. plan.private.mjs stays on your Mac.

import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';

const ITERATIONS = 600000;

const { routines, text } = await import(new URL('../plan.private.mjs', import.meta.url));

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
  pass = await askHidden('Choose a passphrase: ');
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
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ routines, text }))));

// Check it decrypts before writing
await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

const b64 = (u) => Buffer.from(u).toString('base64');
const out = { v: 1, kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };
fs.writeFileSync(new URL('../plan.enc.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('Done. plan.enc.json is updated. Commit and push it:');
console.log('  git add plan.enc.json && git commit -m "Update routine" && git push');
