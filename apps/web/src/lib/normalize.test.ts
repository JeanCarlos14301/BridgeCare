import { describe, expect, it } from "vitest";

import { locateQuote, normalize } from "./normalize";

describe("normalize mirrors the backend", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalize("  Take\n\tLisinopril   10 mg \r\n")).toBe("Take Lisinopril 10 mg");
  });

  it("uses Python's whitespace set, not JavaScript's", () => {
    // Python: " ".join("\ufeffa\x1cb\x85c\u200bd".split()) == "\ufeffa b c\u200bd"
    expect(normalize("\ufeffa\x1cb\x85c\u200bd")).toBe("\ufeffa b c\u200bd");
    expect(normalize("a\u00a0b\u3000c")).toBe("a b c");
  });
});

describe("locateQuote", () => {
  const page = "Discharge instructions\n\nTake Lisinopril 10 mg\n   by mouth once a day.\nFollow up.";

  it("maps a whitespace-variant quote back to the original characters", () => {
    const range = locateQuote(page, "Take Lisinopril 10 mg by mouth once a day.");
    expect(range).not.toBeNull();
    const original = page.slice(range!.start, range!.end);
    expect(original).toBe("Take Lisinopril 10 mg\n   by mouth once a day.");
  });

  it("is case-sensitive like the backend check", () => {
    expect(locateQuote(page, "take lisinopril")).toBeNull();
  });

  it("returns null for a quote that is not on the page", () => {
    expect(locateQuote(page, "Take Lisinopril 20 mg")).toBeNull();
    expect(locateQuote(page, "   ")).toBeNull();
  });
});
