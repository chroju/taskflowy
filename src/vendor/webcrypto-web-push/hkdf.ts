// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/hkdf.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

function createHMAC(data: BufferSource) {
  if (data.byteLength === 0) {
    return {
      hash: () => Promise.resolve(new ArrayBuffer(32)),
    };
  }

  const keyPromise = crypto.subtle.importKey(
    "raw",
    data,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    true,
    ["sign"]
  );

  return {
    hash: async (input: BufferSource) => {
      const k = await keyPromise;
      return crypto.subtle.sign("HMAC", k, input);
    },
  };
}

export async function hkdf(salt: BufferSource, ikm: BufferSource) {
  const prkhPromise = createHMAC(salt)
    .hash(ikm)
    .then((prk) => createHMAC(prk));

  return {
    extract: async (info: BufferSource, len: number) => {
      const input = new Uint8Array([
        ...new Uint8Array(info instanceof Uint8Array ? info : new Uint8Array(ArrayBuffer.isView(info) ? info.buffer : info)),
        ...new Uint8Array([1]),
      ]);
      const prkh = await prkhPromise;
      const hash = await prkh.hash(input);
      return hash.slice(0, len);
    },
  };
}
