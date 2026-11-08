// Checks a name and passphrase against the local and live routine files.
//   node tools/check-passphrase.mjs <name>
import { webcrypto as c } from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline/promises';

const SITE = process.env.SITE_URL || 'https://itechroof.github.io/SelfCareRituals/';
const name = (process.argv[2] || '').trim();
if (!name) {
  console.log('Usage: node tools/check-passphrase.mjs <name>');
  process.exit(1);
}
const hash = new Uint8Array(await c.subtle.digest('SHA-256', new TextEncoder().encode('skin-ritual:' + name.toLowerCase())));
const id = [...hash.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
const path = `plans/${id}.enc.json`;

const local = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : null;
if (!local) console.log(`✗ No routine for "${name}" on this Mac. Run: node tools/encrypt-plan.mjs ${name}`);
let live = null;
try {
  const r = await fetch(SITE + path + '?t=' + Date.now());
  live = r.ok ? await r.json() : null;
} catch {}
if (!live) console.log(`✗ No routine for "${name}" on the live site yet (not pushed, or still publishing).`);
if (local && live) console.log(live.data === local.data ? '✓ The live site has the same file as your Mac.' : '✗ The live site has a DIFFERENT file from your Mac (push it).');
if (!local && !live) process.exit(1);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pass = await rl.question('Type the passphrase: ');
rl.close();

async function works(b) {
  try {
    const base = await c.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    const key = await c.subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(b.salt, 'base64'), iterations: b.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    await c.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(b.iv, 'base64') }, key, Buffer.from(b.data, 'base64'));
    return true;
  } catch {
    return false;
  }
}
if (local) console.log((await works(local)) ? '✓ Opens the file on your Mac.' : '✗ Does NOT open the file on your Mac.');
if (live) console.log((await works(live)) ? '✓ Opens the file on the live site.' : '✗ Does NOT open the file on the live site.');
