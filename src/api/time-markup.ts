// Parsing/generation of Workflowy's inline <time> date markup embedded in node names, e.g.:
//   <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>
//   <time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="30">Tue, Jul 28, 2026 at 2:30 PM</time>
// Only start* attributes are used; end* (date ranges) are ignored for v1.

const TIME_TAG_RE = /<time\b([^>]*)>([\s\S]*?)<\/time>/i;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getAttr(attrs: string, key: string): string | null {
  const m = attrs.match(new RegExp(`\\b${key}="([^"]*)"`));
  return m ? m[1] : null;
}

export function parseTimeMarkup(name: string): { date: string; time: string | null } | null {
  const match = name.match(TIME_TAG_RE);
  if (!match) return null;
  const attrs = match[1];

  const year = getAttr(attrs, "startYear");
  const month = getAttr(attrs, "startMonth");
  const day = getAttr(attrs, "startDay");
  if (!year || !month || !day) return null;

  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  const hour = getAttr(attrs, "startHour");
  const minute = getAttr(attrs, "startMinute");
  const time = hour !== null && minute !== null
    ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
    : null;

  return { date, time };
}

export function stripTimeMarkup(name: string): string {
  return name.replace(TIME_TAG_RE, "").replace(/\s+/g, " ").trim();
}

function formatDisplayDate(date: string, time?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  // Construct in UTC to avoid local-timezone drift affecting the weekday/date.
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS[utcDate.getUTCDay()];
  const month = MONTHS[m - 1];

  let display = `${weekday}, ${month} ${d}, ${y}`;

  if (time) {
    const [hStr, minStr] = time.split(":");
    const h = Number(hStr);
    const min = Number(minStr);
    const period = h < 12 ? "AM" : "PM";
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    display += ` at ${hour12}:${String(min).padStart(2, "0")} ${period}`;
  }

  return display;
}

export function buildTimeMarkup(date: string, time?: string): string {
  const [y, m, d] = date.split("-").map(Number);

  let attrs = `startYear="${y}" startMonth="${m}" startDay="${d}"`;
  if (time) {
    const [hStr, minStr] = time.split(":");
    const h = Number(hStr);
    const min = Number(minStr);
    attrs += ` startHour="${h}" startMinute="${min}"`;
  }

  const display = formatDisplayDate(date, time);
  return `<time ${attrs}>${display}</time>`;
}

export function setTimeMarkup(name: string, date: string, time?: string): string {
  const markup = buildTimeMarkup(date, time);
  if (TIME_TAG_RE.test(name)) {
    return name.replace(TIME_TAG_RE, markup);
  }
  const trimmed = name.replace(/\s+$/, "");
  if (trimmed === "") return markup;
  return `${trimmed} ${markup}`;
}
