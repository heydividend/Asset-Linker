// Centralized date formatting. The user prefers MM/DD/YYYY everywhere a
// date is shown to them, with US-style 12-hour time when a timestamp is
// needed. Keep this as the single source of truth so we don't accidentally
// drift back to ISO/locale-default formatting in random spots.

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  // Bare YYYY-MM-DD strings would otherwise be parsed as UTC midnight, which
  // displays as the previous day in PT. Anchor them to local midnight.
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "05/11/2026"
export function formatDate(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return "";
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

// "05/11" — for tight chart axes only
export function formatDateShort(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return "";
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

// "05/11/2026 3:42 PM"
export function formatDateTime(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return "";
  let h = d.getHours();
  const mins = pad(d.getMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${formatDate(d)} ${h}:${mins} ${ampm}`;
}
