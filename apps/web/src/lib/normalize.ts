/*
 * Mirror of `normalize()` in apps/api/app/services/validation.py: `" ".join(value.split())`.
 * Python's `str.split()` splits on exactly the characters where `str.isspace()` is true, which is
 * not the same set as JavaScript's `\s` (Python includes \x1c-\x1f and \x85, and excludes \ufeff).
 * The set below was listed from the project's Python runtime; keep both sides in sync.
 */
const PYTHON_WHITESPACE = new Set(
  [
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002,
    0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  ].map((code) => String.fromCharCode(code)),
);

export function isPythonWhitespace(char: string): boolean {
  return PYTHON_WHITESPACE.has(char);
}

/** Normalized text plus, for each normalized character, its index in the original string. */
function normalizeWithOffsets(value: string): { text: string; offsets: number[] } {
  let text = "";
  const offsets: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (isPythonWhitespace(char)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += " ";
      offsets.push(index - 1);
      pendingSpace = false;
    }
    text += char;
    offsets.push(index);
  }
  return { text, offsets };
}

export function normalize(value: string): string {
  return normalizeWithOffsets(value).text;
}

/**
 * Find a quote in page text the way the backend verifies it (normalized, case-sensitive substring)
 * and return the matching range in the ORIGINAL text, so the highlight lands on the real characters.
 */
export function locateQuote(pageText: string, quote: string): { start: number; end: number } | null {
  const needle = normalize(quote);
  if (!needle) return null;
  const page = normalizeWithOffsets(pageText);
  const found = page.text.indexOf(needle);
  if (found === -1) return null;
  return { start: page.offsets[found], end: page.offsets[found + needle.length - 1] + 1 };
}
