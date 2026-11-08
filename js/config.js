// Public settings. This file is published, so only put things here you're
// happy for anyone to see.

// Your buddy-nudge server address, after deploying worker/ (see README section 7).
// Leave empty to turn buddy nudges off.
export const NUDGE_SERVER = '';

// Your VAPID public key (from: npx web-push generate-vapid-keys).
// Filled in here, nobody has to paste it on their phone.
export const VAPID_PUBLIC_KEY = 'BKh5JZJfEgsc-xowzCVXw5q-5rLhnvy5B1QXpJwrwdd22acCTqzKeFJA3Gt2yMrV0uG1yhnyi2LvxVdHLkg7jR8';

// Who collects notification addresses for the GitHub reminders.
// Shown on the button: "Send my address to Kirthi".
export const ADMIN_NAME = 'Kirthi';
// Optional: pre-fills the Mail option. Remember this file is public.
export const ADMIN_EMAIL = 'Kirthi.shalom@gmail.com';
