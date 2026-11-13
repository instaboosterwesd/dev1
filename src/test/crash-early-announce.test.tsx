import { describe, expect, it } from "vitest";
import { shouldAnnounceEarly } from "@/routes/index";

describe("early now announcement", () => {
  it("publishes the next round as now once the plane passes 3x, before the crash", () => {
    // A round crashing at 4x announces early once it reaches 3x.
    expect(shouldAnnounceEarly(2.99)).toBe(false);
    expect(shouldAnnounceEarly(3)).toBe(true);
    expect(shouldAnnounceEarly(3.5)).toBe(true);
  });

  it("never announces early for rounds that crash below 3x", () => {
    expect(shouldAnnounceEarly(1.5)).toBe(false);
    expect(shouldAnnounceEarly(2.5)).toBe(false);
  });
});
