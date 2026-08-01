// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/info.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

import { encodeLength } from "./utils";

export function createInfo(
  clientPublic: Uint8Array,
  serverPublic: Uint8Array,
  type: "aesgcm" | "nonce" | "auth"
) {
  return new Uint8Array([
    ...new TextEncoder().encode(`Content-Encoding: ${type}\0`),
    ...new TextEncoder().encode("P-256\0"),
    ...encodeLength(clientPublic.byteLength),
    ...clientPublic,
    ...encodeLength(serverPublic.byteLength),
    ...serverPublic,
  ]);
}

export function createInfo2(type: "aesgcm" | "nonce" | "auth") {
  return new Uint8Array([
    ...new TextEncoder().encode(`Content-Encoding: ${type}\0`),
  ]);
}
