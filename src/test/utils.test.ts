import { describe, it, expect } from "vitest";

// Since utils.js uses DOM APIs, we need jsdom environment (configured in vitest.config.ts)
const { escapeHtml, stripHtml } = await import("../../public/scripts/utils.js");

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("preserves quotes (textContent method)", () => {
    // Note: textContent-based escaping doesn't escape quotes
    expect(escapeHtml('"quoted"')).toBe('"quoted"');
  });

  it("handles plain text", () => {
    expect(escapeHtml("Hello world")).toBe("Hello world");
  });
});

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
    expect(stripHtml("<p>paragraph</p>")).toBe("paragraph");
  });

  it("handles nested tags", () => {
    expect(stripHtml("<div><span>nested</span></div>")).toBe("nested");
  });

  it("handles plain text", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });
});
