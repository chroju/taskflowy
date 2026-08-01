// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/cf-jwt/jwt-algorithms.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31
//
// Trimmed to the single algorithm this vendor module actually uses (ES256,
// for VAPID JWT signing). The upstream file supports the full JWT algorithm
// family (ES384/512, HS*, RS*); those branches are unreachable from
// buildPushPayload and were dropped to keep the vendored surface minimal.

export type JwtAlgorithm = "ES256";

// EcdsaParams: the shape crypto.subtle.sign()/verify() expect for ECDSA.
export const algorithms: Record<JwtAlgorithm, EcdsaParams> = {
  ES256: { name: "ECDSA", hash: { name: "SHA-256" } },
};
