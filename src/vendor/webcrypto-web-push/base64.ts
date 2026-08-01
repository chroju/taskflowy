// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/cf-jwt/base64.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31
//
// Original used the `base64-arraybuffer` package for the base64 codec; that
// dependency is inlined here (standard base64 alphabet, no external calls)
// so this module has zero runtime dependencies.

// Looser than the DOM lib's `BufferSource` (which pins TypedArrays to
// `ArrayBuffer`, not `ArrayBufferLike`) so this accepts the Uint8Array
// results that flow through the rest of this vendor module unmodified.
type Bytes = ArrayBuffer | ArrayBufferView;

const CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(data: Bytes): string {
  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(ArrayBuffer.isView(data) ? data.buffer : data);
  let result = "";
  let i: number;

  for (i = 0; i + 3 <= bytes.length; i += 3) {
    result += CHARS[bytes[i] >> 2];
    result += CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    result += CHARS[bytes[i + 2] & 63];
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    result += CHARS[bytes[i] >> 2];
    result += CHARS[(bytes[i] & 3) << 4];
    result += "==";
  } else if (remaining === 2) {
    result += CHARS[bytes[i] >> 2];
    result += CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += CHARS[(bytes[i + 1] & 15) << 2];
    result += "=";
  }

  return result;
}

export function decodeBase64(str: string): ArrayBuffer {
  const clean = str.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const value = CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes).buffer;
}

export function decodeBase64Url(str: string): ArrayBuffer {
  return decodeBase64(str.replace(/-/g, "+").replace(/_/g, "/"));
}

export function encodeBase64Url(arr: Bytes): string {
  return encodeBase64(arr)
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=+$/, "");
}

export function base64UrlToObject<T extends Record<string, unknown>>(
  str: string
): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(str))) as T;
}

export function objectToBase64Url<T extends Record<string, unknown>>(
  obj: T
): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}
