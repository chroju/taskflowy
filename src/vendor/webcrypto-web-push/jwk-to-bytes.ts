// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/jwk-to-bytes.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

import { decodeBase64Url } from "./base64";
import { invariant } from "./utils";

export function ecJwkToBytes(jwk: JsonWebKey) {
  invariant(jwk.x, "jwk.x is missing");
  invariant(jwk.y, "jwk.y is missing");

  const xBytes = new Uint8Array(decodeBase64Url(jwk.x));
  const yBytes = new Uint8Array(decodeBase64Url(jwk.y));

  // ANSI X9.62 point encoding - 0x04 for uncompressed
  const raw = [0x04, ...xBytes, ...yBytes];

  return new Uint8Array(raw);
}
