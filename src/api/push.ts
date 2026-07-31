import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { PushSubscriptionRecord } from "../types";

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  // Node id to open when the notification is tapped. Falls back to the app
  // root when omitted (e.g. for bundled "daily" notifications).
  url?: string;
  [key: string]: string | undefined;
}

export interface SendPushResult {
  ok: boolean;
  status: number;
  // true when the push service reports the subscription no longer exists
  // (404/410) - callers should drop it from storage.
  expired: boolean;
}

const TTL_SECONDS = 60 * 60 * 24; // 24h; push services drop the message after this if undelivered

export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: NotificationPayload,
  vapid: VapidConfig
): Promise<SendPushResult> {
  const message = {
    data: payload,
    options: { ttl: TTL_SECONDS },
  };

  const built = await buildPushPayload(message, subscription, vapid);
  const res = await fetch(subscription.endpoint, {
    method: built.method,
    headers: built.headers,
    body: built.body as BodyInit,
  });

  const expired = res.status === 404 || res.status === 410;
  return { ok: res.ok, status: res.status, expired };
}

// VAPID keys are an ECDSA P-256 key pair. @block65/webcrypto-web-push only
// consumes keys (via vapidHeaders/buildPushPayload); it does not generate
// them, so key generation is implemented here directly against WebCrypto.
//
// Encoding matches what the library expects when reading keys back
// (see its vapidHeaders implementation):
//   - publicKey: base64url of the raw EC point (0x04 || X || Y, 65 bytes) -
//     this is also the format browsers expect for PushManager.subscribe's
//     applicationServerKey.
//   - privateKey: base64url of the JWK "d" parameter (the raw scalar).
export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function generateVapidKeyPair(): Promise<VapidKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  if (!jwkPrivate.d) {
    throw new Error("Failed to export VAPID private key");
  }

  return {
    publicKey: base64UrlEncode(new Uint8Array(rawPublic)),
    privateKey: jwkPrivate.d,
  };
}
