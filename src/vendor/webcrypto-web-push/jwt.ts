// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/cf-jwt/jwt.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

import type { JwtAlgorithm } from "./jwt-algorithms";

export interface JwtHeader {
  typ: "JWT";
  alg: JwtAlgorithm;
  kid?: string;
  [key: string]: unknown;
}

export type JwtPayload = {
  /** Issuer */
  iss?: string;

  /** Subject */
  sub?: string;

  /** Audience */
  aud?: string | string[];

  /** Expiration Time */
  exp?: number;

  /** Not Before */
  nbf?: number;

  /** Issued At */
  iat?: number;

  /** JWT ID */
  jti?: string;

  [key: string]: unknown;
};
