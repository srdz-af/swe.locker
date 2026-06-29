import { describe, expect, it } from "vitest";
import { calculateResumeGrade, gradeResume } from "./resumeGrader.js";

describe("gradeResume", () => {
  it("returns a valid temporary grading result", () => {
    const result = gradeResume({
      sourceName: "resume.pdf",
      parsedText: "Alex Rivera\nSoftware Engineer"
    });

    expect(["S", "A", "B", "C"]).toContain(result.rank);
    expect(result.verdict).toBeTruthy();
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.comments.length).toBeGreaterThan(0);

    for (const metric of result.metrics) {
      expect(metric.label).toBeTruthy();
      expect(Number.isInteger(metric.value)).toBe(true);
      expect(metric.value).toBeGreaterThanOrEqual(0);
      expect(metric.value).toBeLessThanOrEqual(100);
    }

    for (const commentGroup of result.comments) {
      expect(commentGroup.id).toBeTruthy();
      expect(commentGroup.label).toBeTruthy();
      expect(commentGroup.scoreLabel).toBeTruthy();
      expect(commentGroup.comments.length).toBeGreaterThan(0);

      for (const comment of commentGroup.comments) {
        expect(comment.id).toBeTruthy();
        expect(comment.text).toBeTruthy();
        expect(Number.isInteger(comment.start)).toBe(true);
        expect(Number.isInteger(comment.end)).toBe(true);
        expect(comment.start).toBeGreaterThanOrEqual(0);
        expect(comment.end).toBeGreaterThan(comment.start);
      }
    }
  });

  it("calculates the grade as the rounded average of metric scores", () => {
    expect(
      calculateResumeGrade([
        { label: "Structure", value: 90 },
        { label: "Impact", value: 82 },
        { label: "Evidence", value: 87 }
      ])
    ).toBe(86);
    expect(calculateResumeGrade([])).toBeNull();
  });
});
