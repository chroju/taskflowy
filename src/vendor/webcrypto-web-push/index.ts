// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/main.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31
//
// Reason: @block65/webcrypto-web-push had no release since December 2024 and
// the Web Push protocol it implements (RFC 8291/8292) is stable, so there is
// no upstream to track. Vendoring removes the dependency and keeps the
// crypto code directly auditable in-repo.
//
// Only the entry points actually used by src/api/push.ts are re-exported.
// The upstream package also exports a JWT verification stack
// (verify/verifyJwks/decode) used for validating *incoming* push-related
// JWTs; taskflowy only ever sends push messages (VAPID JWTs it signs
// itself), so that verification code path was not vendored.

export type { PushMessage, PushSubscription } from "./types";

export { encryptNotification } from "./encrypt";

export type { VapidKeys } from "./vapid";
export { vapidHeaders } from "./vapid";

export { buildPushPayload } from "./payload";
