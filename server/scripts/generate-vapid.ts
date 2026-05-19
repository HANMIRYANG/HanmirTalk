// One-shot helper: generate a VAPID key pair for Web Push.
// Usage from repo root:
//   npx tsx server/scripts/generate-vapid.ts
// Copy the printed lines into your .env file. Run once per deployment.

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

// eslint-disable-next-line no-console
console.log("# Paste these into .env (then restart the server):");
// eslint-disable-next-line no-console
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
// eslint-disable-next-line no-console
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
// eslint-disable-next-line no-console
console.log(`VAPID_SUBJECT=mailto:admin@hanmir-talk.local`);
