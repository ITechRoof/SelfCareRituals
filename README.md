# Skin Ritual

A personal skincare app that runs on iPhone as a home-screen web app. No App Store, no developer certificate, nothing to re-sign.

It includes:

- **Guided routines:** start a routine and it picks morning or evening from the time, asks "pre-gym or post-gym?" in the morning, and picks retinal or rest night from the day.
- **Season-aware steps:** portions and notes switch between summer and winter care, based on today's forecast or set manually.
- **Drying timers between steps:** tap Done and a countdown starts. It chimes and moves to the next step by itself. Wait times come from your plan and can be adjusted in Settings > Drying times.
- **Morning and evening tracking:** each day has a morning tick (your main post-gym routine), an evening tick (retinal or rest night), and a pre-gym tick on gym days. A day counts towards your streak when both morning and evening are done. Routines you did without the app can be ticked by hand. The heatmap splits each day into a morning half and an evening half.
- **Weekly skin notes.**
- **Buddy nudges:** a friendly push when a buddy logs a routine and you've missed a few days (section 7).
- **Five colour themes:** Twilight, Soft pastel, Warm luxe, Fresh spa and Bold jewel, each with a dark-mode version. Choose in Settings > Theme.
- **Progress photos:** photos per area with a faint overlay of the last shot so angles match, plus a before/after slider.
- **AI chat:** an Ask tab that knows your plan, today's weather and your recent log (uses your Anthropic API key).
- **Reminders:** via your iPhone Calendar (simple) or real push notifications sent by a GitHub Action (advanced).
- **Offline use:** works offline after the first load.

Everything you log stays on your phone. Nothing is uploaded except weather lookups and chat messages you send.

---

## 1. Put it on GitHub Pages

1. Sign in to GitHub as **itechroof** and create a new **public** repository called `skin-ritual`. GitHub Pages is free for public repos.
2. Upload everything in this folder, including the hidden `.github` folder:
   - **From a computer:** use `git push`, or drag the files onto the repo page with "Add file > Upload files". Some browsers skip folders starting with a dot, so check that `.github/workflows/reminders.yml` arrived. If it didn't, create it with "Add file > Create new file" and paste its contents.
   - With git:
     ```bash
     cd skin-ritual
     git init && git add . && git commit -m "Skin Ritual"
     git branch -M main
     git remote add origin https://github.com/itechroof/skin-ritual.git
     git push -u origin main
     ```
3. In the repo, open **Settings > Pages**. Under "Build and deployment", choose **Deploy from a branch**, then branch `main` and folder `/ (root)`, and save.
4. After a minute or two the app is live at **https://itechroof.github.io/skin-ritual/**

## 2. Install it on your iPhone

1. Open the link above in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. From now on, always open it from the home-screen icon. iPhone keeps a home-screen app's data separate from Safari, so logs made in one won't show in the other.
4. On first launch, tick your gym days and allow location so the forecast can pick summer or winter care.

## 3. Reminders

### Easy: Calendar

In **Settings > Reminders**, set your times and tap **Add to Calendar**. iPhone offers to add repeating events with alerts:

- Pre-gym (on your gym days only)
- Morning skincare
- Retinal night (Mon/Thu)
- Rest night
- Weekly progress photos

If the download doesn't open from the home-screen app, open the same page in Safari and tap the button there.

### Real push notifications

This needs iOS 16.4 or later and the app installed on the Home Screen. A GitHub Action checks `reminders.json` every 15 minutes and sends any reminder that's due.

**You, once:**

1. **Make a key pair.** Run this once and keep both keys in your password manager:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. **Add three secrets** in GitHub under **Settings > Secrets and variables > Actions**:
   - `VAPID_PUBLIC_KEY`: the public key
   - `VAPID_PRIVATE_KEY`: the private key
   - `VAPID_SUBJECT`: `mailto:` followed by your email address, with no spaces
3. **Fill in `js/config.js`:**
   - `VAPID_PUBLIC_KEY`: the same public key
   - `ADMIN_NAME`: your name, shown on everyone's Send button
   - `ADMIN_EMAIL` (optional): adds an Email option. The file is public.

   Then push.

**Each person, on their phone:**

1. Open the app from the Home Screen.
2. Go to **Settings > Reminders > Turn on notifications > Allow**.
3. Tap **Send my address to …**. The share sheet opens. Pick WhatsApp, Messages or Mail and send it to you.

**You, for each message you receive:**

1. Copy the whole message on your Mac.
2. In the project folder, run:
   ```bash
   pbpaste | node tools/add-subscription.mjs
   ```
3. It saves that phone in `private/subscriptions.json` (never uploaded) and updates the `PUSH_SUBSCRIPTION` secret with everyone, using the GitHub CLI.

If it can't reach GitHub, it prints the text to paste into the secret yourself. Other commands:

```bash
node tools/add-subscription.mjs --list            # who is subscribed
node tools/add-subscription.mjs --remove priya    # take someone off
```

**Test:** go to the **Actions** tab, then **Skincare reminders > Run workflow**. The log checks your keys and email format first, and the run turns red if anything fails.

Some things to know:

- **Times:** reminders use the UK times in `reminders.json`, the same for everyone. Edit and push to change them.
- **Delays:** GitHub can start scheduled jobs a few minutes late.
- **Pauses:** GitHub pauses scheduled workflows after 60 days without commits. It emails you first, and one click re-enables them.
- **Reinstalls:** if someone reinstalls the app or changes phone, they tap **Send my address** again and you run the command again.

## 4. AI chat

1. Create an API key at **console.anthropic.com** and add a little credit.
2. Paste the key into **Settings > AI chat**. It's stored only on your phone and is never included in backups or the repo.
3. The model defaults to `claude-sonnet-5-5`. You can change the name in Settings if you'd like a different one.

The chat is given your full plan, today's weather and season, the routine that's due, your last 14 days of logs, and this week's skin notes.

## 5. People, passwords and routines

Each person signs in with a **name** and their own **passphrase**, and gets their own routine:

- **Encrypted routines:** each routine is stored encrypted in `plans/`, one file per person. The file names are scrambled codes, so the repo doesn't show who uses the app.
- **Private source files:** the readable routines live in `private/`, one file per person, named after their login name. `private/` is never uploaded (see `.gitignore`).
- **Separate data on each phone:** logs, notes, photos, chat, settings and theme are kept per person, even if two people share a phone.
- **Hidden accounts:** a wrong name and a wrong passphrase give the same message, so nobody can find out who has an account.

You need Node.js on your Mac (`node -v`; install with `brew install node`).

### Set up your own login

```bash
node tools/encrypt-plan.mjs me
git add plans && git commit -m "My routine" && git push
```

`me` is your login name. To use a different name, rename the file first: `mv private/me.mjs private/kiru.mjs`, then run `node tools/encrypt-plan.mjs kiru`.

### Add another person

1. Start from an existing routine and edit it for them:
   ```bash
   cp private/me.mjs private/priya.mjs
   open -e private/priya.mjs
   ```
   Keep the four routines (`preGym`, `postGym`, `retinal`, `rest`). Inside them you can change everything: names (e.g. call `retinal` "Peel night"), steps, products, portions, drying times, and which days each evening routine runs (`days: [1, 4]` means Monday and Thursday, with 0 for Sunday). Update the `text` at the bottom too. The AI chat reads it.
2. Encrypt it and choose their passphrase:
   ```bash
   node tools/encrypt-plan.mjs priya
   ```
3. Upload it:
   ```bash
   git add plans && git commit -m "Add Priya" && git push
   ```
4. Send them the link and their passphrase privately. They sign in with name **priya**. Capitals don't matter in names.

### Change a routine or passphrase

Edit `private/<name>.mjs`, run `node tools/encrypt-plan.mjs <name>` again, and push. Their phone asks for the passphrase again if it changed.

### Remove a person

Delete their file in `plans/` and push. They can no longer sign in.

### Check a login

```bash
node tools/check-passphrase.mjs <name>
```

This shows whether the name and passphrase open the routine on your Mac and on the live site.

On the phone, **Settings > Account > Sign out** switches to another person.

## 6. Backups

Logs, notes and photos live in the app's storage on your phone. Use **Settings > Backup > Export** now and then, and save the file to Files or iCloud Drive. **Import** merges a backup back in.

## 7. Buddy nudges

When someone finishes a routine, any buddy who has missed a few days gets one friendly push notification, like *"You haven't done your routine for 4 days. Keep up with Kirthi to maintain your glow ✨"*.

- **Not every day:** at most one nudge per person every 3 days, never between 21:00 and 08:00, and only when a buddy actually logs a routine. People who have never used the app aren't nudged.
- **What the server stores:** this runs on a tiny free Cloudflare Worker (in `worker/`). It keeps only each person's push address, the date of their latest routine, and the date of their last nudge. No products, logs or photos.

### One-time setup (about 15 minutes)

You need a free Cloudflare account. All commands run on your Mac, from the project folder.

1. **Push keys.** Skip this if you made them for GitHub reminders already:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. **Create the server:**
   ```bash
   cd worker
   npx wrangler login                        # opens the browser to sign in to Cloudflare
   npx wrangler kv namespace create NUDGES   # copy the id it prints
   ```
   Paste that id into `worker/wrangler.toml` in place of `PASTE_YOUR_KV_ID_HERE`. Then:
   ```bash
   npx wrangler deploy                       # prints your server address, e.g. https://skin-ritual-nudges.<you>.workers.dev
   npx wrangler secret put VAPID_PUBLIC_KEY  # paste the public key
   npx wrangler secret put VAPID_PRIVATE_KEY # paste the private key
   npx wrangler secret put VAPID_SUBJECT     # type mailto:your@email.com
   cd ..
   ```
3. **Choose buddies.** At the bottom of each person's `private/<name>.mjs` there's a `profile`:
   ```js
   export const profile = {
     displayName: 'Kirthi',  // how buddies see you: "Keep up with Kirthi"
     buddies: ['priya'],     // whose nudges your routines can trigger
     nudgeAfterDays: 3,      // you get nudged after missing this many days
   };
   ```
   `buddies` works one way: Kirthi's routines nudge Priya. For both directions, add each other.
4. **Encrypt everyone and upload the user list.** Encrypting gives each person a private key for the server:
   ```bash
   node tools/encrypt-plan.mjs me        # repeat for each person
   node tools/nudge-users.mjs
   cd worker && npx wrangler secret put USERS < ../private/worker-users.json && cd ..
   ```
5. **Connect the app.** In `js/config.js`, fill in your server address and VAPID public key, then push:
   ```bash
   git add . && git commit -m "Buddy nudges" && git push
   ```
6. **On each phone,** open the app from the Home Screen, go to **Settings > Reminders > Turn on notifications**, then tap **Send a test**.

### Later

- **New person, or changed buddies:** run `node tools/nudge-users.mjs` and the `wrangler secret put USERS` line again. A new person also needs `encrypt-plan` and a `git push`.
- **Change the rules:** the cooldown and quiet hours are in `worker/wrangler.toml`. Run `npx wrangler deploy` after editing.
- **Change the messages:** they're at the top of `worker/src/index.js`.
- **Keep two files safe:** `private/.keys.json` and `private/worker-users.json` stay on your Mac with the routines. They're never uploaded.

## Files

```
index.html               app shell
css/styles.css           styles (light and dark), Twilight theme
css/themes.css           the other four themes
js/plan.js               routine logic
js/lock.js               passphrase unlock
plans/                   everyone's routines, encrypted (safe to upload)
private/                 everyone's routines, readable (stays on your Mac)
tools/encrypt-plan.mjs   encrypts one person's routine into plans/
tools/check-passphrase.mjs  checks a name and passphrase
tools/nudge-users.mjs    builds the buddy list for the nudge server
tools/add-subscription.mjs  adds a phone to the GitHub reminders
js/config.js             nudge server address and push key (public)
js/nudge.js              tells the server when you've done a routine
worker/                  the buddy-nudge server (Cloudflare Worker)
js/app.js                Today, Settings, reminders, backup
js/runner.js             step-by-step routine and drying timer
js/progress.js           heatmap, weekly tracker, notes
js/photos.js             camera, gallery, compare
js/ask.js                AI chat
js/weather.js            forecast and season
js/store.js              on-phone storage
sw.js                    offline cache and notifications
reminders.json           push reminder schedule
.github/workflows/       GitHub Action that sends push reminders
```

*Your plan is informational, not medical advice. If something stings, burns or flares, pause the actives and check with a pharmacist or dermatologist.*
