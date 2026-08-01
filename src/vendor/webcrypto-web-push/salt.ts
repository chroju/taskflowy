// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/salt.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

export async function getSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}
