import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockBuildPushPayload } = vi.hoisted(() => ({
  mockBuildPushPayload: vi.fn(),
}));

vi.mock("@block65/webcrypto-web-push", () => ({
  buildPushPayload: mockBuildPushPayload,
}));

import { sendPush, generateVapidKeyPair } from "../api/push";
import type { PushSubscriptionRecord } from "../types";

function makeSub(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    endpoint: "https://push.example.com/abc",
    expirationTime: null,
    keys: { auth: "auth-key", p256dh: "p256dh-key" },
    ...overrides,
  };
}

describe("sendPush", () => {
  beforeEach(() => {
    mockBuildPushPayload.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    );
  });

  it("builds a payload and posts it to the subscription endpoint", async () => {
    mockBuildPushPayload.mockResolvedValue({
      headers: { "content-type": "application/octet-stream" },
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    });

    const sub = makeSub();
    const result = await sendPush(
      sub,
      { title: "Buy milk", body: "Groceries" },
      { subject: "mailto:test@example.com", publicKey: "pub", privateKey: "priv" }
    );

    expect(mockBuildPushPayload).toHaveBeenCalledWith(
      { data: { title: "Buy milk", body: "Groceries" }, options: { ttl: expect.any(Number) } },
      sub,
      { subject: "mailto:test@example.com", publicKey: "pub", privateKey: "priv" }
    );
    expect(fetch).toHaveBeenCalledWith(
      sub.endpoint,
      expect.objectContaining({ method: "POST" })
    );
    expect(result.ok).toBe(true);
    expect(result.expired).toBe(false);
  });

  it("reports expired=true on a 404 response (subscription gone)", async () => {
    mockBuildPushPayload.mockResolvedValue({
      headers: {},
      method: "POST",
      body: new Uint8Array(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const result = await sendPush(makeSub(), { title: "x", body: "y" }, {
      subject: "mailto:a@b.com",
      publicKey: "pub",
      privateKey: "priv",
    });

    expect(result.ok).toBe(false);
    expect(result.expired).toBe(true);
  });

  it("reports expired=true on a 410 response (Gone)", async () => {
    mockBuildPushPayload.mockResolvedValue({
      headers: {},
      method: "POST",
      body: new Uint8Array(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 410 })));

    const result = await sendPush(makeSub(), { title: "x", body: "y" }, {
      subject: "mailto:a@b.com",
      publicKey: "pub",
      privateKey: "priv",
    });

    expect(result.expired).toBe(true);
  });

  it("reports ok=false, expired=false on other error statuses", async () => {
    mockBuildPushPayload.mockResolvedValue({
      headers: {},
      method: "POST",
      body: new Uint8Array(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const result = await sendPush(makeSub(), { title: "x", body: "y" }, {
      subject: "mailto:a@b.com",
      publicKey: "pub",
      privateKey: "priv",
    });

    expect(result.ok).toBe(false);
    expect(result.expired).toBe(false);
  });
});

describe("generateVapidKeyPair", () => {
  it("generates a base64url-encoded public/private key pair", async () => {
    const keys = await generateVapidKeyPair();
    expect(typeof keys.publicKey).toBe("string");
    expect(typeof keys.privateKey).toBe("string");
    expect(keys.publicKey.length).toBeGreaterThan(0);
    expect(keys.privateKey.length).toBeGreaterThan(0);
    // base64url: no +, /, or = padding
    expect(keys.publicKey).not.toMatch(/[+/=]/);
    expect(keys.privateKey).not.toMatch(/[+/=]/);
  });
});
