import { describe, expect, it } from "vitest";
import { normalizeExternalApplicationTrackingUrl } from "./externalUrl.js";

describe("normalizeExternalApplicationTrackingUrl", () => {
  it("adds https when the pasted link has no scheme", () => {
    expect(normalizeExternalApplicationTrackingUrl("company.example.com/application")).toBe(
      "https://company.example.com/application"
    );
  });

  it("trims and preserves valid http(s) links", () => {
    expect(normalizeExternalApplicationTrackingUrl("  https://company.example.com/application  ")).toBe(
      "https://company.example.com/application"
    );
  });

  it("returns null for blank values", () => {
    expect(normalizeExternalApplicationTrackingUrl("   ")).toBeNull();
  });

  it("rejects non-web URL schemes", () => {
    expect(() => normalizeExternalApplicationTrackingUrl("javascript:alert(1)")).toThrow();
  });
});
