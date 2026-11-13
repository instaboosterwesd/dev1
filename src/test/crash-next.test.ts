import { describe, expect, it } from "vitest";
import { generateCrash, generateUpcoming } from "@/lib/crash-config";

describe("upcoming crash values", () => {
  it("manual 20–30 stays inside the range", () => {
    for (const v of generateUpcoming({ mode: "manual", min: 20, max: 30 }, 200)) {
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(30);
    }
  });
  it("auto produces values from 1.01x up to 1000x", () => {
    expect(generateCrash({ mode: "auto", min: 1.01, max: 3 }, () => 0)).toBe(1.01);
    expect(generateCrash({ mode: "auto", min: 1.01, max: 3 }, () => 0.999999)).toBe(1000);
  });
});
