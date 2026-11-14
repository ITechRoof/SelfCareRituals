# Skin Ritual

A personal skincare app that runs on iPhone as a home-screen web app. No App Store, no developer certificate, nothing to re-sign.

It includes:

- **Guided routines:** start a routine and it picks morning or evening from the time, asks "pre-gym or post-gym?" in the morning, and picks retinal or rest night from the day.
- **Season-aware steps:** portions and notes switch between summer and winter care, based on today's forecast or set manually.
- **Drying timers between steps:** tap Done and a countdown starts. It chimes and moves to the next step by itself. Wait times come from your plan and can be adjusted in Settings > Drying times.
- **Morning and evening tracking:** each day has a morning tick (your main post-gym routine), an evening tick (retinal or rest night), and a pre-gym tick on gym days. A day counts towards your streak when both morning and evening are done. Routines you did without the app can be ticked by hand. The heatmap splits each day into a morning half and an evening half.
- **Weekly skin notes.**
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

### Advanced: real push notifications

This needs iOS 16.4 or later and the app installed on the home screen. A GitHub Action checks `reminders.json` every 15 minutes and sends any reminder that's due.

1. **Make keys** on any computer with Node.js:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Never commit the private key. Your repo is public.
2. **Add secrets** in the repo under **Settings > Secrets and variables > Actions > New repository secret**:
   - `VAPID_PUBLIC_KEY`: the public key
   - `VAPID_PRIVATE_KEY`: the private key
   - `VAPID_SUBJECT`: `mailto:` followed by your email
3. **Subscribe your phone.** In the app, go to **Settings > Reminders > Push notifications from GitHub**, paste the **public** key, and tap **Turn on notifications**. Then tap **Copy**.
4. **Save the subscription** as a repo secret named `PUSH_SUBSCRIPTION`.
5. **Test it.** Open the repo's **Actions** tab, choose **Skincare reminders**, then **Run workflow**. A test notification should arrive.
6. **Change times** by editing `reminders.json`. Times are UK local time (`Europe/London`), and the days and texts are yours to change.

Some things to know about push:

- GitHub can run scheduled jobs a few minutes late. Reminders fire within a 15-minute window of the set time.
- GitHub pauses scheduled workflows on a public repo after 60 days without any commits. It emails you first, and one click re-enables them. Any small commit also resets the clock.
- If you reinstall the app or clear its data, turn notifications on again and update the `PUSH_SUBSCRIPTION` secret.
- Tapping a routine notification opens the app straight into **Start routine**. The photo reminder opens the Photos tab.

## 4. AI chat

1. Create an API key at **console.anthropic.com** and add a little credit.
2. Paste the key into **Settings > AI chat**. It's stored only on your phone and is never included in backups or the repo.
3. The model defaults to `claude-sonnet-5-5`. You can change the name in Settings if you'd like a different one.

The chat is given your full plan, today's weather and season, the routine that's due, your last 14 days of logs, and this week's skin notes.

## 5. Your routine is private

The repo is public, but your routine isn't readable in it:

- **Encrypted routine:** your products, order, portions and drying times are stored only in `plan.enc.json`, encrypted with AES-256. It's unreadable without your passphrase.
- **Lock screen:** the app asks for the passphrase before showing anything. Tick "Stay unlocked on this phone" and you'll only enter it once. iPhone can also save it in Passwords and offer it with Face ID.
- **Private source file:** the readable version, `plan.private.mjs`, lives only on your Mac. `.gitignore` stops git from uploading it.
- **Your logs, notes and photos** never leave your phone at all.

### First-time setup, and whenever you change your routine

You need Node.js on your Mac. Check with `node -v`, or install it with `brew install node`.

1. Edit `plan.private.mjs` if you want to change anything. Each step looks like:
   ```js
   {
     id: 'pm-serum',                      // unique, never reuse
     product: 'Serum name',
     area: 'Face & neck',
     portion: { all: '1 dropper' },       // or { summer: '…', winter: '…' }
     how: 'How to apply it',
     note: { winter: 'Winter-only tip' },
     wait: { summer: 180, winter: 300, label: 'Let it dry' },  // seconds
   }
   ```
2. Encrypt it:
   ```bash
   node tools/encrypt-plan.mjs
   ```
   It asks for a passphrase twice. Use at least 12 characters. Four random words is strong and easy to type, e.g. *lantern cobalt mango drift*. The passphrase isn't stored anywhere, so keep it in your password manager. If you forget it, run the script again with a new one.
3. Upload the encrypted file:
   ```bash
   git add plan.enc.json && git commit -m "Update routine" && git push
   ```

Changing the passphrase works the same way. Your phone notices and asks for the new one. To lock the app on your phone, go to **Settings > Privacy > Lock now**.

Drying times can also be adjusted on the phone in **Settings > Drying times**, without re-encrypting.

## 6. Backups

Logs, notes and photos live in the app's storage on your phone. Use **Settings > Backup > Export** now and then, and save the file to Files or iCloud Drive. **Import** merges a backup back in.

## Files

```
index.html               app shell
css/styles.css           styles (light and dark)
js/plan.js               routine logic
js/lock.js               passphrase unlock
plan.enc.json            your routine, encrypted (safe to upload)
plan.private.mjs         your routine, readable (stays on your Mac)
tools/encrypt-plan.mjs   turns the private file into plan.enc.json
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
