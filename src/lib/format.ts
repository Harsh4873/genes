export function fmtCoord(n: number): string {
  return n.toLocaleString('en-US');
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtFixed(n: number, digits = 1): string {
  return n.toFixed(digits);
}

export function fmtSigned(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Highlight matched ranges from a query inside a label, as {text, hit} spans.
 *  Each whitespace-separated token is marked independently. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const ranges: { start: number; end: number }[] = [];
  for (const token of tokens) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(token, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + token.length });
      from = idx + token.length;
    }
  }
  if (!ranges.length) return [{ text, hit: false }];
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  for (const range of merged) {
    if (range.start > i) out.push({ text: text.slice(i, range.start), hit: false });
    out.push({ text: text.slice(range.start, range.end), hit: true });
    i = range.end;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}
