import { describe, expect, it } from "vitest";

import { providerLabel } from "./ProviderPill";

describe("providerLabel", () => {
  it("names AMD only for an AMD host", () => {
    expect(providerLabel("developer.amd.com.cn")).toBe("AMD Token Factory");
    expect(providerLabel("api.amd.com")).toBe("AMD Token Factory");
    expect(providerLabel("amd.com.evil.test")).toBe("Remote model · amd.com.evil.test");
    expect(providerLabel("notamd.com")).toBe("Remote model · notamd.com");
    expect(providerLabel(null)).toBe("Live model");
  });
});
