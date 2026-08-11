import { describe, it, expect } from "vitest";

// richtext.js is a browser ES module (DOM-based, like utils.js)
const { renderRichText, renderRichTitle, isImageUrl, plainTextWithImageUrls } = await import(
  "../../public/scripts/richtext.js"
);

describe("isImageUrl", () => {
  it("accepts common image extensions over http(s)", () => {
    expect(isImageUrl("https://i.gyazo.com/abc.png")).toBe(true);
    expect(isImageUrl("https://example.com/photo.jpg")).toBe(true);
    expect(isImageUrl("https://example.com/photo.jpeg")).toBe(true);
    expect(isImageUrl("https://example.com/a.gif")).toBe(true);
    expect(isImageUrl("https://example.com/a.webp")).toBe(true);
    expect(isImageUrl("http://example.com/a.png")).toBe(true);
  });

  it("accepts image URLs with query strings", () => {
    expect(isImageUrl("https://example.com/a.png?w=200")).toBe(true);
  });

  it("rejects non-image and non-http URLs", () => {
    expect(isImageUrl("https://example.com/page")).toBe(false);
    expect(isImageUrl("https://example.com/a.pdf")).toBe(false);
    expect(isImageUrl("javascript:alert(1)")).toBe(false);
    expect(isImageUrl("data:image/png;base64,xxx")).toBe(false);
    expect(isImageUrl("")).toBe(false);
    expect(isImageUrl(null)).toBe(false);
  });
});

describe("renderRichText: whitelist", () => {
  it("returns empty string for empty input", () => {
    expect(renderRichText("")).toBe("");
    expect(renderRichText(null)).toBe("");
  });

  it("escapes plain text", () => {
    expect(renderRichText("a & b")).toBe("a &amp; b");
    expect(renderRichText("1 < 2")).toBe("1 &lt; 2");
  });

  it("keeps inline formatting tags", () => {
    expect(renderRichText("<b>bold</b>")).toBe("<b>bold</b>");
    expect(renderRichText("<i>it</i> and <u>ul</u> and <s>st</s>")).toBe(
      "<i>it</i> and <u>ul</u> and <s>st</s>"
    );
    expect(renderRichText("<code>x = 1</code>")).toBe("<code>x = 1</code>");
    expect(renderRichText("<strong>a</strong><em>b</em>")).toBe(
      "<strong>a</strong><em>b</em>"
    );
  });

  it("unwraps unknown tags but keeps their content", () => {
    expect(renderRichText("<div>text</div>")).toBe("text");
    expect(renderRichText("<p><b>bold</b></p>")).toBe("<b>bold</b>");
  });

  it("drops <time> markup entirely", () => {
    expect(
      renderRichText('x <time startYear="2026" startMonth="8" startDay="1">Sat, Aug 1, 2026</time>')
    ).toBe("x ");
  });

  it("keeps nested formatting", () => {
    expect(renderRichText("<b><i>both</i></b>")).toBe("<b><i>both</i></b>");
  });

  it("strips attributes from formatting tags", () => {
    expect(renderRichText('<b onclick="alert(1)" style="color:red">x</b>')).toBe("<b>x</b>");
  });

  it("preserves newlines in text", () => {
    expect(renderRichText("line1\nline2")).toBe("line1\nline2");
  });
});

describe("renderRichText: colored spans", () => {
  it("keeps Workflowy color classes only", () => {
    expect(renderRichText('<span class="colored c-red">red</span>')).toBe(
      '<span class="c-red">red</span>'
    );
    expect(renderRichText('<span class="colored bc-yellow">hl</span>')).toBe(
      '<span class="bc-yellow">hl</span>'
    );
  });

  it("unwraps spans without a recognized color class", () => {
    expect(renderRichText('<span class="evil">x</span>')).toBe("x");
    expect(renderRichText("<span>x</span>")).toBe("x");
  });

  it("drops other attributes from colored spans", () => {
    expect(renderRichText('<span class="c-blue" onclick="alert(1)">x</span>')).toBe(
      '<span class="c-blue">x</span>'
    );
  });
});

describe("renderRichText: links", () => {
  it("keeps http(s) links, hardened and marked", () => {
    expect(renderRichText('<a href="https://example.com/page">docs</a>')).toBe(
      '<a href="https://example.com/page" target="_blank" rel="noopener noreferrer" class="rt-link">docs</a>'
    );
  });

  it("unwraps links with unsafe protocols", () => {
    expect(renderRichText('<a href="javascript:alert(1)">x</a>')).toBe("x");
    expect(renderRichText("<a>x</a>")).toBe("x");
  });

  it("linkifies bare URLs in text", () => {
    expect(renderRichText("see https://example.com/a here")).toBe(
      'see <a href="https://example.com/a" target="_blank" rel="noopener noreferrer" class="rt-link">https://example.com/a</a> here'
    );
  });

  it("does not linkify inside an existing link", () => {
    expect(renderRichText('<a href="https://example.com">https://example.com</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="rt-link">https://example.com</a>'
    );
  });
});

// 画像はテキストを置き換えない: URL はリンクとして本文中に残し、サムネイルは
// 本文の後ろへまとめて追加する（「おおお URL ははは」の流れを崩さない）。
describe("renderRichText: images", () => {
  const IMG = "https://i.gyazo.com/abc.png";
  const LINK = (href: string, text: string = href) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" class="rt-link">${text}</a>`;
  const THUMB = (src: string) =>
    `<img src="${src}" alt="" loading="lazy" draggable="false" class="rt-img">`;

  it("keeps a self-labelled image link as text and appends the thumbnail after", () => {
    expect(renderRichText(`<a href="${IMG}">${IMG}</a>`)).toBe(LINK(IMG) + THUMB(IMG));
  });

  it("keeps surrounding text in place, image below", () => {
    expect(renderRichText(`おおお ${IMG} ははは`)).toBe(
      `おおお ${LINK(IMG)} ははは` + THUMB(IMG)
    );
  });

  it("keeps an image link with custom text as a link, thumbnail after", () => {
    expect(renderRichText(`<a href="${IMG}">screenshot</a>`)).toBe(
      LINK(IMG, "screenshot") + THUMB(IMG)
    );
  });

  it("turns an <img> tag into its URL link plus the thumbnail", () => {
    expect(renderRichText(`<img src="${IMG}" onerror="alert(1)" width="600">`)).toBe(
      LINK(IMG) + THUMB(IMG)
    );
  });

  it("collapses duplicate image URLs into one thumbnail", () => {
    expect(renderRichText(`${IMG} と ${IMG}`)).toBe(
      `${LINK(IMG)} と ${LINK(IMG)}` + THUMB(IMG)
    );
  });

  it("appends multiple distinct thumbnails in order of appearance", () => {
    const A = "https://example.com/a.png";
    const B = "https://example.com/b.png";
    expect(renderRichText(`${A} ${B}`)).toBe(`${LINK(A)} ${LINK(B)}` + THUMB(A) + THUMB(B));
  });

  it("drops <img> with unsafe src entirely", () => {
    expect(renderRichText('<img src="javascript:alert(1)">')).toBe("");
    expect(renderRichText('<img src="data:image/png;base64,xxx">')).toBe("");
  });

  it("trusts an <img> tag even without an image extension", () => {
    const RAW = "https://example.com/uploaded";
    expect(renderRichText(`<img src="${RAW}">`)).toBe(LINK(RAW) + THUMB(RAW));
  });
});

describe("plainTextWithImageUrls", () => {
  it("flattens markup to text, keeping link text (how Workflowy stores image URLs)", () => {
    expect(
      plainTextWithImageUrls('<a href="https://i.gyazo.com/a.png">https://i.gyazo.com/a.png</a>')
    ).toBe("https://i.gyazo.com/a.png");
    expect(plainTextWithImageUrls("<b>bold</b> text")).toBe("bold text");
  });

  it("turns <img> tags into their URL so editing does not lose the image", () => {
    expect(plainTextWithImageUrls('<img src="https://example.com/a.png">')).toBe(
      "https://example.com/a.png"
    );
    expect(plainTextWithImageUrls('before <img src="https://example.com/a.png"> after')).toBe(
      "before https://example.com/a.png after"
    );
  });

  it("handles empty input", () => {
    expect(plainTextWithImageUrls("")).toBe("");
    expect(plainTextWithImageUrls(null)).toBe("");
  });
});

describe("renderRichText: XSS", () => {
  it("removes script/style elements including their content", () => {
    expect(renderRichText('<script>alert(1)</script>x')).toBe("x");
    expect(renderRichText("<style>body{}</style>x")).toBe("x");
  });

  it("neutralizes event handlers on unwrapped tags", () => {
    expect(renderRichText('<div onclick="alert(1)">x</div>')).toBe("x");
    expect(renderRichText('<svg onload="alert(1)"></svg>x')).toBe("x");
  });

  it("escapes text that looks like markup after unwrapping", () => {
    expect(renderRichText("<div>&lt;script&gt;</div>")).toBe("&lt;script&gt;");
  });
});

describe("renderRichTitle", () => {
  it("normalizes like a plain title when there is no markup", () => {
    expect(renderRichTitle("  hello   world  ")).toBe("hello world");
    expect(renderRichTitle("19:44 買い物")).toBe("買い物");
    expect(renderRichTitle("🔥 タスク")).toBe("タスク");
    expect(renderRichTitle("")).toBe("");
  });

  it("keeps inline formatting in titles", () => {
    expect(renderRichTitle("<b>大事</b>な作業")).toBe("<b>大事</b>な作業");
  });

  it("strips emoji inside formatting tags", () => {
    expect(renderRichTitle("<b>🔥急ぎ</b>")).toBe("<b>急ぎ</b>");
  });

  it("drops <time> markup from titles", () => {
    expect(
      renderRichTitle('task <time startYear="2026" startMonth="8" startDay="1">Aug 1</time>')
    ).toBe("task");
  });

  it("returns empty string for a title with no visible content", () => {
    expect(renderRichTitle("<b> </b>")).toBe("");
    expect(renderRichTitle("🔥")).toBe("");
  });

  it("keeps an image-only title as its URL link plus the thumbnail", () => {
    const IMG = "https://i.gyazo.com/a.png";
    expect(renderRichTitle(`<a href="${IMG}">${IMG}</a>`)).toBe(
      `<a href="${IMG}" target="_blank" rel="noopener noreferrer" class="rt-link">${IMG}</a>` +
        `<img src="${IMG}" alt="" loading="lazy" draggable="false" class="rt-img">`
    );
  });

  it("renders links tappable in titles", () => {
    expect(renderRichTitle('<a href="https://example.com">ref</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="rt-link">ref</a>'
    );
  });
});
