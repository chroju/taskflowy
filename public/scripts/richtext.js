// Safe rendering of Workflowy inline rich text (Issue #13). Workflowy stores
// formatting as a small set of HTML tags inside node names/notes (<b>, <i>,
// <a href>, <span class="colored c-red">, ...). This module sanitizes that
// HTML down to a whitelist and returns a safe HTML string for innerHTML;
// everything else is dropped or unwrapped to its text (which the serializer
// escapes). Image links (Workflowy displays image URLs inline) become
// constrained <img class="rt-img"> thumbnails.
//
// DOM-based like utils.js, unit-testable under jsdom (src/test/richtext.test.ts).

// Inline formatting tags kept as-is (attributes stripped). <a>, <span> and
// <img> have their own attribute handling below.
const FORMAT_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "CODE", "BR"]);

// Elements whose text content must not leak into the output when the tag is
// removed (everything else is unwrapped, keeping its children).
const DROP_WITH_CONTENT = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH",
  // Due-date markup is rendered separately (task-due column / detail sheet).
  "TIME",
]);

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif)$/i;
const URL_RE = /https?:\/\/[^\s<>"']+/g;

// Same normalization the plain-title path applies (tasks.js normalizeTitle):
// emoji are design noise in list rows.
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu;

function isSafeHttpUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

// True for http(s) URLs whose path ends in a raster-image extension
// (query strings allowed). Workflowy renders such links as inline images.
export function isImageUrl(url) {
  if (!isSafeHttpUrl(url)) return false;
  try {
    return IMAGE_EXT_RE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function makeLink(href) {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener noreferrer");
  a.setAttribute("class", "rt-link");
  return a;
}

function makeImg(src) {
  const img = document.createElement("img");
  img.setAttribute("src", src);
  img.setAttribute("alt", "");
  img.setAttribute("loading", "lazy");
  // ネイティブの画像ドラッグは行スワイプ（Pointer Events）と競合するため切る
  img.setAttribute("draggable", "false");
  img.setAttribute("class", "rt-img");
  return img;
}

// Appends `text` to `out`, converting bare URLs into links (or inline images
// for image URLs). Skipped inside an existing <a> to avoid nested links.
function appendText(text, out, ctx) {
  if (text === "") return;
  if (ctx.title) {
    text = text.replace(EMOJI_RE, "").replace(/\s+/g, " ");
  }
  if (ctx.inLink) {
    out.appendChild(document.createTextNode(text));
    return;
  }
  URL_RE.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = URL_RE.exec(text))) {
    if (m.index > last) out.appendChild(document.createTextNode(text.slice(last, m.index)));
    const url = m[0];
    if (isImageUrl(url)) {
      out.appendChild(makeImg(url));
    } else {
      const a = makeLink(url);
      a.textContent = url;
      out.appendChild(a);
    }
    last = m.index + url.length;
  }
  if (last < text.length) out.appendChild(document.createTextNode(text.slice(last)));
}

function sanitizeChildren(node, out, ctx) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      appendText(child.data, out, ctx);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;

    if (DROP_WITH_CONTENT.has(tag)) continue;

    if (FORMAT_TAGS.has(tag)) {
      const el = document.createElement(tag.toLowerCase());
      sanitizeChildren(child, el, ctx);
      out.appendChild(el);
      continue;
    }

    if (tag === "SPAN") {
      // Workflowy text/highlight colors: class="colored c-red" / "colored bc-red".
      // Only the color token survives; a span without one is unwrapped.
      const colors = (child.getAttribute("class") || "")
        .split(/\s+/)
        .filter((c) => /^(c|bc)-[a-z]+$/.test(c));
      if (colors.length > 0) {
        const el = document.createElement("span");
        el.setAttribute("class", colors.join(" "));
        sanitizeChildren(child, el, ctx);
        out.appendChild(el);
      } else {
        sanitizeChildren(child, out, ctx);
      }
      continue;
    }

    if (tag === "A") {
      const href = child.getAttribute("href") || "";
      if (!isSafeHttpUrl(href)) {
        sanitizeChildren(child, out, ctx); // unwrap: keep the text, lose the link
        continue;
      }
      const text = (child.textContent || "").trim();
      // A link whose visible text is just its own URL (how Workflowy stores a
      // pasted image URL) renders as the image itself.
      if (isImageUrl(href) && (text === "" || text === href)) {
        out.appendChild(makeImg(href));
        continue;
      }
      const a = makeLink(href);
      sanitizeChildren(child, a, { ...ctx, inLink: true });
      out.appendChild(a);
      continue;
    }

    if (tag === "IMG") {
      const src = child.getAttribute("src") || "";
      if (isSafeHttpUrl(src)) out.appendChild(makeImg(src));
      continue;
    }

    // Anything else: unwrap, keeping (sanitized) children.
    sanitizeChildren(child, out, ctx);
  }
}

function textNodesOf(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

// Title-only cleanup after sanitizing: trim the ends and drop a literal
// leading "HH:MM " timestamp, mirroring normalizeTitle (tasks.js). Per-text
// whitespace collapsing and emoji removal already happened in appendText.
function finalizeTitle(out) {
  const texts = textNodesOf(out);
  if (texts.length === 0) return;
  texts[0].data = texts[0].data.replace(/^\s+/, "");
  texts[texts.length - 1].data = texts[texts.length - 1].data.replace(/\s+$/, "");
  if (out.firstChild && out.firstChild.nodeType === Node.TEXT_NODE) {
    out.firstChild.data = out.firstChild.data.replace(/^\d{1,2}:\d{2}\s+/, "");
  }
}

function render(raw, ctx) {
  if (!raw) return "";
  const doc = new DOMParser().parseFromString(String(raw), "text/html");
  const out = document.createElement("div");
  sanitizeChildren(doc.body, out, ctx);
  if (ctx.title) finalizeTitle(out);
  if (!out.textContent.trim() && !out.querySelector("img")) return "";
  return out.innerHTML;
}

// Note / multi-line rendering: whitespace is preserved (the note faces use
// white-space: pre-wrap). Returns "" when nothing visible remains.
export function renderRichText(raw) {
  return render(raw, { title: false, inLink: false });
}

// Title rendering for list rows and the detail sheet. Normalized like the old
// plain path (emoji stripped, whitespace collapsed, leading timestamp cut)
// but with the formatting whitelist kept. Returns "" when nothing visible
// remains (the caller falls back to its placeholder).
export function renderRichTitle(raw) {
  return render(raw, { title: true, inLink: false });
}
