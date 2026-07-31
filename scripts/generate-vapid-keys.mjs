#!/usr/bin/env node
// Generates a VAPID (ECDSA P-256) key pair for Web Push, using the same
// WebCrypto-based encoding as src/api/push.ts#generateVapidKeyPair (kept as a
// standalone script since it needs to run outside the Workers runtime, via
// plain Node).
//
// Usage: npm run generate-vapid-keys

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return Buffer.from(binary, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function main() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const publicKey = base64UrlEncode(new Uint8Array(rawPublic));
  const privateKey = jwkPrivate.d;

  console.log("VAPID_PUBLIC_KEY=" + publicKey);
  console.log("VAPID_PRIVATE_KEY=" + privateKey);
  console.log("");
  console.log("Set these as Worker secrets:");
  console.log("  npx wrangler secret put VAPID_PUBLIC_KEY");
  console.log("  npx wrangler secret put VAPID_PRIVATE_KEY");
  console.log("  npx wrangler secret put VAPID_SUBJECT   # e.g. mailto:you@example.com");
  console.log("");
  console.log("For local dev, add the same three lines (without the wrangler commands) to .dev.vars.");
}

main();
