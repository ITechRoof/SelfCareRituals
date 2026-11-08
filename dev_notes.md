# Skin Ritual: developer notes

How the app is put together, how to look after it, and ideas explored but not built yet. The user guide is in `README.md`.

## Quick checklist

### Adding someone

1. **Make their routine and push it:**
   ```bash
   cp private/kirthi.mjs private/<name>.mjs        # then edit it for them
   node tools/encrypt-plan.mjs <name>              # choose their passphrase
   git add plans && git commit -m "Add <name>" && git push
   ```
2. **Send them** the link (`itechroof.github.io/SelfCareRituals`), their name and their passphrase, privately.
3. **They install the app** from Safari with **Open as Web App** switched on, sign in, then go to **Settings > Turn on notifications > Send my address**.
4. **You copy their message** on the Mac and run:
   ```bash
   pbpaste | node tools/add-subscription.mjs
   ```

### Things to keep in mind

- **Pauses:** GitHub pauses scheduled reminders after 60 days with no commits. It emails you first, and one click turns them back on.
- **Reinstalls:** if anyone reinstalls the app or gets a new phone, they tap **Send my address** again and you run the command again.
- **Updating the app:** add `--exclude 'js/config.js'` when copying new files in, so your public key and admin name aren't blanked.
- **Optional tidy-up:** to clear the Node.js warning in the Actions log, change `checkout@v4` and `setup-node@v4` to `@v5`, and `node-version: 22`, in `.github/workflows/reminders.yml`.

### Still on the later list

Buddy nudges with the small server (see below). It would also let each person sign up for notifications themselves and set their own reminder times, so you wouldn't need to copy addresses.

## How it works

- **Hosting:** a static web app on GitHub Pages, installed on iPhone as a Home Screen web app. There's no app server, no build step and no framework: plain HTML, CSS and ES modules. It works offline through a service worker (`sw.js`).
  - Repo: `github.com/ITechRoof/SelfCareRituals`. Site: `itechroof.github.io/SelfCareRituals/`.
- **Routines are encrypted per person:**
  - Readable routines live in `private/<name>.mjs` on the Mac only (git-ignored).
  - `tools/encrypt-plan.mjs` encrypts each one into `plans/<id>.enc.json`. The id is a SHA-256 hash of the login name, so names aren't visible in the repo.
  - Encryption is AES-256-GCM with a key from PBKDF2-SHA256 (600k iterations).
  - The app decrypts after sign-in. "Stay signed in" keeps the derived key on the phone in IndexedDB, non-extractable.
- **Everything else stays on the phone,** separately per person:
  - Logs, notes, chat and settings: `localStorage` key `skin-ritual:v2:<id>`.
  - Photos: IndexedDB `skin-ritual-photos-<id>`.
- **Weather:** Open-Meteo, no key needed. The season comes from today's forecast high (summer care at 18°C or above by default), or by month as a fallback.
- **AI chat:** calls the Anthropic API directly from the phone with each person's own key. The prompt includes their plan text, today's weather, the last 14 days of logs and this week's notes.
- **Push reminders:** a GitHub Action (`.github/workflows/reminders.yml`) runs every 15 minutes and sends web push to the phones in the `PUSH_SUBSCRIPTION` secret, using the times in `reminders.json` (UK time).

## Looking after it

### Updating the app

Unzip the new version and copy it in, keeping your own routines and config:

```bash
rsync -av --exclude '.git' --exclude 'plans/' --exclude 'private/' --exclude 'js/config.js' ~/Downloads/"<new folder>"/ ./
git add . && git commit -m "Update" && git push
```

- **Find the newest download:** `grep -rl "<something new>" ~/Downloads --include=app.js`.
- **Service worker version:** after any code change, bump `VERSION` in `sw.js`. Phones pick up the update on the second launch after the push.
- **Plan files:** encrypted plan files are always fetched fresh, so routine changes apply straight away.

### People and routines

```bash
cp private/kirthi.mjs private/priya.mjs        # start from an existing routine, then edit
node tools/encrypt-plan.mjs priya              # sets her passphrase
git add plans && git commit -m "Add Priya" && git push
node tools/check-passphrase.mjs priya          # checks the Mac copy and the live site
```

- **Change a routine or passphrase:** edit the private file, run `encrypt-plan` again, and push.
- **Remove someone:** delete their file in `plans/` and push.
- **Routine structure:** every routine file must keep the four slots `preGym`, `postGym`, `retinal` and `rest`. Names, steps, products, portions, drying times and evening days can all change. Step fields are documented at the top of each private file.
- **Wrong name or passphrase:** both give the same error, by design.

### Push reminders

One-time setup, already done:

1. **Key pair:** made with `npx web-push generate-vapid-keys`, one pair for the whole app.
2. **GitHub secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` plus an email, no spaces) and `PUSH_SUBSCRIPTION`.
3. **`js/config.js`:** `VAPID_PUBLIC_KEY` set to the same public key, and `ADMIN_NAME`.

To add a phone, the person taps **Settings > Turn on notifications > Send my address**. Copy their message on the Mac, then:

```bash
pbpaste | node tools/add-subscription.mjs      # also --list, --remove <name>, --upload
```

This keeps addresses in `private/subscriptions.json` and updates the secret with the GitHub CLI.

**Test:** in the Actions tab, run **Skincare reminders > Run workflow**. The log checks the key pair and email format first, and the run turns red on any failure.

| Log says | Cause and fix |
|---|---|
| `BadJwtToken` | The public and private keys aren't a pair, or `VAPID_SUBJECT` is badly formatted. Make one fresh pair and update both secrets and `config.js` |
| `VapidPkHashMismatch` | The phone subscribed with an older public key. Turn notifications on again in the app and send a new address |
| Address contains `fcm.googleapis.com` | It came from a desktop browser (Chrome), not the iPhone |
| Red "Open from Home Screen" line in the app | It was added without **Open as Web App**. Delete it and add it again with the switch on |
| `Push secrets are not set yet` | `PUSH_SUBSCRIPTION` is missing |

Things that need occasional attention:
- **Paused schedules:** GitHub pauses scheduled workflows after 60 days without commits. It emails you first, and one click re-enables them.
- **Late runs:** scheduled runs can start a few minutes late.

## Personal routine edits

People can edit their own routine in the app (**Settings > My routine**). Edits live only on their phone, in `state.settings.routineEdits`, so they're included in backups:

```js
{ steps: { 'post-anr': { product, portion: { all } | { summer, winter }, how, off: true } },
  added: { postGym: [ { id: 'u-1a2b3c4d', product, area, portion: { all }, how, wait, only, after } ] },
  retinalDays: [2, 5] }
```

`after` is the id of the step an added step follows (`'__start'` means first). If that step disappears in a later plan update, the added step goes to the end. Added steps have ids starting `u-`, so they show up in logs and per-step timings like any other step.

- **Merging:** `applyEdits()` in `js/plan.js` layers them over the decrypted plan at sign-in and after every edit.
  - Fields a person hasn't touched keep following the admin's plan, including later updates.
  - Edits to a step id that no longer exists are ignored.
- **Retinal nights:** changing them puts every other evening on the rest routine.
- **AI chat:** `describeEdits()` turns the edits into words for the chat's system prompt.
- **Warnings, never blocking:**
  - retinal nights back to back, more retinal nights than the plan, or none
  - turning off a sunscreen step
  - an acid, exfoliant or retinoid added to a retinal night or before the gym (a keyword check in `js/editor.js`)
  - a step placed after sunscreen in the morning
- **You can't see their edits.** If someone asks why their routine looks different from yours, their edits are the reason. **Undo all my changes** resets them.

Ideas for later: reordering the plan's own steps, smarter rule checks from each person's plan text, and syncing edits across devices (needs the server).

## Data recorded

Each log entry (`state.logs`) contains:

| Field | Meaning |
|---|---|
| `date` | Skincare day. Before 4am counts as the previous day (`DAY_START_HOUR` in `js/util.js`) |
| `routine`, `slot` | e.g. `retinal` / `pm` |
| `season` | `summer` / `winter` (`null` for hand ticks) |
| `startedAt`, `finishedAt`, `loggedAt` | Timestamps in milliseconds |
| `timeEstimated` | `true` when a hand tick was made on another day or in the wrong part of the day. Older hand ticks without the field also count as estimated |
| `manual` | `true` for hand ticks from the Progress screen |
| `tz`, `tzOffsetMin` | e.g. `Europe/London`, `60` during British Summer Time |
| `skipped`, `swaps` | Step ids |
| `steps[]` | Per step: `startedAt`, `doneAt`, `skipped`, `swapped`, `waitPlannedSec`, `waitedSec`, `waitAddedSec`, `waitCutShort` |

Weekly skin notes are in `state.notes`, keyed by the Monday's date. **Settings > Backup > Export** gives everything as JSON.

## Built but not switched on: buddy nudges

When someone logs a routine, any buddy who has missed `nudgeAfterDays` days (default 3) gets one push. It sends at most one per person every 3 days, never between 21:00 and 08:00, and nobody who has never used the app is nudged. The message rotates between three friendly versions, at the top of `worker/src/index.js`.

- **Server:** a Cloudflare Worker with KV in `worker/`. It stores only each person's push address, latest routine date and last nudge date.
- **Phones:** send only their user id, a per-person key (inside their encrypted routine) and a date.
- **Tested:** locally end to end, including decrypting the push payload and checking the VAPID signature.
- **Switched off** while `NUDGE_SERVER` in `js/config.js` is empty.

To switch it on:

1. **Deploy the server:**
   ```bash
   cd worker
   npx wrangler login
   npx wrangler kv namespace create NUDGES
   ```
   Paste the id into `wrangler.toml`, then:
   ```bash
   npx wrangler deploy
   npx wrangler secret put VAPID_PUBLIC_KEY      # same keys as the GitHub reminders
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT
   ```
2. **Set buddies** in each `private/<name>.mjs` `profile` (`displayName`, `buddies`, `nudgeAfterDays`). `buddies` works one way.
3. **Encrypt everyone again** (this adds their key), then upload the user list:
   ```bash
   node tools/nudge-users.mjs
   cd worker && npx wrangler secret put USERS < ../private/worker-users.json
   ```
4. **Connect the app:** set `NUDGE_SERVER` in `js/config.js` and push.
5. **On each phone:** go to **Settings > Turn on notifications**, then **Send a test**.

Rules live in `worker/wrangler.toml`: `NUDGE_COOLDOWN_DAYS`, `QUIET_START` and `QUIET_END`.

## Ideas to explore

**Server options** for nudges, self sign-up for notifications, and per-person reminder times:

| Option | Notes |
|---|---|
| Cloudflare Worker (built) | Free, small, already tested. Could also replace the GitHub reminders, so phones register themselves and each person gets their own times |
| Supabase | Free tier with a database. Would also allow syncing logs between devices. Free projects pause after a week idle |
| Firebase | Server functions need the pay-as-you-go plan with a card. Heavier than needed |
| ntfy app | No server code, but notifications come from the ntfy app, and a shared access key sits in everyone's routine |
| "Cheer a buddy" button | Opens WhatsApp or iMessage with a ready message. No infrastructure, but no automatic detection |

**Using the recorded times:**
- **Smarter reminders:** suggest reminder times from habits, e.g. *"you usually do your evening routine around 22:15, move the reminder?"*. Wait for a few weeks of data first.
- **Sunscreen timing:** flag post-gym sunscreen going on late against UV.
- **Waits and irritation:** link skipped or shortened drying waits (especially ANR before retinal) to irritation in weekly notes.
- **Routine length:** typical duration of each routine.
- **Consistency:** a gentle *"most consistent week yet"* message.
- **CSV export** of logs for analysis in a spreadsheet.

**Privacy and hosting:**
- **Login in front of the whole site:** Cloudflare Pages with Cloudflare Access (free, email one-time code) would put a real login in front of everything and allow a private repo. A private repo would need the reminder cron moved to specific times, because of the Actions minutes limit. Add `crossorigin="use-credentials"` to the manifest link.
- **Old commits:** check the repo's early history doesn't still contain the plain-text routine from before encryption. If it does, delete and recreate the repo, or force-push a fresh history.

**App structure:**
- **Flexible routines:** allow any number of routines and slots per person, instead of the fixed four. Within a routine, people can already add their own steps.
- **Steps per person:** let each person set step-level drying times in their routine file, as well as in the app's Settings.

**Housekeeping:**
- **Workflow update:** move to `actions/checkout@v5` and `actions/setup-node@v5` with `node-version: 22` to clear the Node 20 warning.
- **Eye retinal portion:** the source PDF was garbled for the Medik8 eye retinal portion, so it was read as "½ rice grain in total". Check it in your private routine.

## Files

```
index.html, manifest.webmanifest, sw.js, icons/   app shell and offline support
css/styles.css, css/themes.css                    styles and the five themes
js/app.js         Today, Settings, sign-in, notifications, backup
js/runner.js      guided routine, drying timer, per-step timeline
js/progress.js    tracker, heatmap, notes, hand ticks
js/photos.js      camera, ghost overlay, compare
js/ask.js         AI chat
js/editor.js      "My routine" editor (personal edits)
js/plan.js        routine logic (data comes from the encrypted plan)
js/store.js       per-person storage, streaks, photos
js/lock.js        sign-in and decryption
js/weather.js     forecast and season
js/nudge.js       buddy-nudge check-ins (off until configured)
js/config.js      public settings: push key, admin name, nudge server
js/util.js        dates (4am day boundary), helpers
plans/            encrypted routines (uploaded)
private/          readable routines, keys, subscriptions (never uploaded)
reminders.json    reminder times for the GitHub Action
tools/            encrypt-plan, check-passphrase, add-subscription, nudge-users
worker/           buddy-nudge server (Cloudflare Worker)
.github/          reminder workflow and sender script
```
