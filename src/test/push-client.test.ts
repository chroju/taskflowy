import { describe, it, expect } from "vitest";

const { urlBase64ToUint8Array } = await import("../../public/scripts/push.js");

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url string into the matching byte array", () => {
    // "hello" -> base64 "aGVsbG8=" -> base64url "aGVsbG8"
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it("handles base64url characters (- and _) not present in standard base64", () => {
    // bytes [251, 255, 191] -> base64 "+/+/" -> base64url "-_-_"
    const result = urlBase64ToUint8Array("-_-_");
    expect(Array.from(result)).toEqual([251, 255, 191]);
  });

  it("handles strings requiring no padding", () => {
    // "test" (4 bytes) -> base64 "dGVzdA==" -> base64url "dGVzdA" (needs padding added back)
    const result = urlBase64ToUint8Array("dGVzdA");
    expect(Array.from(result)).toEqual([116, 101, 115, 116]);
  });
});
