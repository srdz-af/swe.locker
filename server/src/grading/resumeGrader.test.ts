import { describe, expect, it } from "vitest";
import { gradeResume } from "./resumeGrader.js";

describe("gradeResume", () => {
  it("returns a valid temporary grading result", () => {
    const result = gradeResume({
      sourceName: "resume.pdf",
      parsedText: "Alex Rivera\nSoftware Engineer"
    });

    expect(Number.isInteger(result.grade)).toBe(true);
    expect(result.grade).toBeGreaterThanOrEqual(0);
    expect(result.grade).toBeLessThanOrEqual(100);
    expect(["S", "A", "B", "C"]).toContain(result.rank);
    expect(result.verdict).toBeTruthy();
    expect(result.metrics.length).toBeGreaterThan(0);

    for (const metric of result.metrics) {
      expect(metric.label).toBeTruthy();
      expect(Number.isInteger(metric.value)).toBe(true);
      expect(metric.value).toBeGreaterThanOrEqual(0);
      expect(metric.value).toBeLessThanOrEqual(100);
    }
  });
});
