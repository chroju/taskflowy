// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/cf-jwt/sign.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

import { encodeBase64Url, objectToBase64Url } from "./base64";
import { algorithms, type JwtAlgorithm } from "./jwt-algorithms";
import type { JwtHeader, JwtPayload } from "./jwt";

export async function sign(
  payload: JwtPayload,
  key: CryptoKey,
  options: {
    algorithm: JwtAlgorithm;
    kid?: string;
  }
): Promise<string> {
  if (payload === null || typeof payload !== "object") {
    throw new Error("payload must be an object");
  }

  if (!(key instanceof CryptoKey)) {
    throw new Error("key must be a CryptoKey");
  }

  if (typeof options.algorithm !== "string") {
    throw new Error("options.algorithm must be a string");
  }

  const headerStr = objectToBase64Url<JwtHeader>({
    typ: "JWT",
    alg: options.algorithm,
    ...(options.kid && { kid: options.kid }),
  });

  const payloadStr = objectToBase64Url<JwtPayload>({
    iat: Math.floor(Date.now() / 1000),
    ...payload,
  });

  const dataStr = `${headerStr}.${payloadStr}`;

  const signature = await crypto.subtle.sign(
    algorithms[options.algorithm],
    key,
    new TextEncoder().encode(dataStr)
  );

  return `${dataStr}.${encodeBase64Url(signature)}`;
}
