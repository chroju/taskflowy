// Output-format checks for the vendored src/vendor/webcrypto-web-push
// module (see that directory's file headers for provenance). The existing
// push.test.ts mocks this module entirely, so it never exercises the real
// crypto; these tests call the real vapidHeaders/buildPushPayload against
// WebCrypto-generated keys and assert the wire format matches the Web Push
// protocol (RFC 8291/8292), independent of the original npm package.
import { describe, it, expect } from "vitest";
import { buildPushPayload, vapidHeaders } from "../vendor/webcrypto-web-push";
import { base64UrlToObject, encodeBase64Url } from "../vendor/webcrypto-web-push/base64";

async function makeVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    subject: "mailto:test@example.com",
    publicKey: encodeBase64Url(rawPublic),
    privateKey: jwkPrivate.d as string,
  };
}

async function makeSubscription(endpoint = "https://push.example.com/abc") {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const auth = crypto.getRandomValues(new Uint8Array(16));

  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: encodeBase64Url(rawPublic),
      auth: encodeBase64Url(auth),
    },
  };
}

describe("vendor webcrypto-web-push: vapidHeaders", () => {
  it("produces a WebPush authorization header wrapping a well-formed ES256 JWT", async () => {
    const vapid = await makeVapidKeys();
    const subscription = await makeSubscription();

    const { headers } = await vapidHeaders(subscription, vapid);

    expect(headers["crypto-key"]).toBe(`p256ecdsa=${vapid.publicKey}`);
    expect(headers.authorization).toMatch(/^WebPush /);

    const jwt = headers.authorization.replace(/^WebPush /, "");
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    const header = base64UrlToObject<{ typ: string; alg: string }>(parts[0]);
    expect(header.typ).toBe("JWT");
    expect(header.alg).toBe("ES256");

    const payload = base64UrlToObject<{
      aud: string;
      sub: string;
      exp: number;
      iat: number;
    }>(parts[1]);
    expect(payload.aud).toBe(new URL(subscription.endpoint).origin);
    expect(payload.sub).toBe(vapid.subject);
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBe(12 * 60 * 60);
  });

  it("throws when a required vapid field is missing", async () => {
    const subscription = await makeSubscription();
    await expect(
      vapidHeaders(subscription, {
        subject: undefined,
        publicKey: "pub",
        privateKey: "priv",
      })
    ).rejects.toThrow("Vapid subject is empty");
  });
});

describe("vendor webcrypto-web-push: buildPushPayload", () => {
  it("encrypts the payload and emits aesgcm Web Push headers", async () => {
    const vapid = await makeVapidKeys();
    const subscription = await makeSubscription();
    const plaintextJson = JSON.stringify({ title: "Buy milk", body: "Groceries" });

    const built = await buildPushPayload(
      { data: { title: "Buy milk", body: "Groceries" }, options: { ttl: 3600 } },
      subscription,
      vapid
    );

    expect(built.method).toBe("post");
    expect(built.headers["content-encoding"]).toBe("aesgcm");
    expect(built.headers["content-type"]).toBe("application/octet-stream");
    expect(built.headers.ttl).toBe("3600");
    expect(built.headers["content-length"]).toBe(
      built.body.byteLength.toString()
    );

    // crypto-key carries both the ephemeral ECDH public key (dh=) used for
    // this message and the VAPID public key (p256ecdsa=) from vapidHeaders.
    expect(built.headers["crypto-key"]).toMatch(/^dh=[A-Za-z0-9_-]+;p256ecdsa=/);
    expect(built.headers["crypto-key"]).toContain(`p256ecdsa=${vapid.publicKey}`);

    // encryption salt: base64url, no padding/URL-unsafe chars
    expect(built.headers.encryption).toMatch(/^salt=[A-Za-z0-9_-]+$/);

    // The body is ciphertext - it must not equal the plaintext bytes, and
    // per the aesgcm content-encoding it carries a 2-byte padding-length
    // prefix plus a 16-byte AES-GCM auth tag beyond the plaintext length.
    const plaintextBytes = new TextEncoder().encode(plaintextJson);
    expect(built.body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(built.body)).not.toContain("Buy milk");
    expect(built.body.byteLength).toBe(plaintextBytes.byteLength + 2 + 16);
  });

  it("passes through urgency and topic options when provided", async () => {
    const vapid = await makeVapidKeys();
    const subscription = await makeSubscription();

    const built = await buildPushPayload(
      { data: "hello", options: { ttl: 60, urgency: "high", topic: "reminder" } },
      subscription,
      vapid
    );

    expect(built.headers.urgency).toBe("high");
    expect(built.headers.topic).toBe("reminder");
  });

  it("defaults ttl to 60 when not provided", async () => {
    const vapid = await makeVapidKeys();
    const subscription = await makeSubscription();

    const built = await buildPushPayload({ data: "x" }, subscription, vapid);

    expect(built.headers.ttl).toBe("60");
  });

  it("produces different ciphertext and salt across calls (fresh salt/ephemeral key per send)", async () => {
    const vapid = await makeVapidKeys();
    const subscription = await makeSubscription();
    const message = { data: "same payload" };

    const first = await buildPushPayload(message, subscription, vapid);
    const second = await buildPushPayload(message, subscription, vapid);

    expect(first.headers.encryption).not.toBe(second.headers.encryption);
    expect(Buffer.from(first.body).toString("hex")).not.toBe(
      Buffer.from(second.body).toString("hex")
    );
  });
});
