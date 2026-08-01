// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/client-keys.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

import { decodeBase64Url, encodeBase64Url } from "./base64";
import type { PushSubscription } from "./types";

export async function deriveClientKeys(sub: PushSubscription) {
  const publicBytes = decodeBase64Url(sub.keys.p256dh);

  const publicJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(publicBytes.slice(1, 33)),
    y: encodeBase64Url(publicBytes.slice(33, 65)),
    ext: true,
  };

  return {
    publicBytes: new Uint8Array(publicBytes),
    publicKey: await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      []
    ),
    authSecretBytes: decodeBase64Url(sub.keys.auth),
  };
}
