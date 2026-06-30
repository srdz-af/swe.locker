import { describe, expect, it } from "vitest";
import { calculateResumeGrade, gradeResume } from "./resumeGrader.js";

describe("gradeResume", () => {
  it("returns a valid temporary grading result", () => {
    const parsedText =
      "Alex Rivera\nE XPERIENCE\nAcme | Software Engineer Jan 2025 – Jun 2025\n– Built a deployment pipeline,\nserving 10 teams\nNext Co | Software Engineer Jun 2025 – Present\n– Reduced incident response time";
    const result = gradeResume({
      sourceName: "resume.pdf",
      parsedText
    });
    const bullets = result.resumeItems.flatMap((item) => item.bullets);

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

    expect(result.resumeItems).toHaveLength(2);
    expect(getRangeText(parsedText, result.resumeItems[0].title)).toBe("Acme");
    expect(getRangeText(parsedText, result.resumeItems[0].description)).toBe("Software Engineer");
    expect(getRangeText(parsedText, result.resumeItems[0].date)).toBe("Jan 2025 – Jun 2025");
    expect(getRangeText(parsedText, bullets[0].range)).toContain("serving 10 teams");
    expect(getRangeText(parsedText, bullets[0].range)).not.toContain("Next Co");
    expect(getRangeText(parsedText, result.resumeItems[1].title)).toBe("Next Co");
    expect(getRangeText(parsedText, result.resumeItems[1].description)).toBe("Software Engineer");
    expect(getRangeText(parsedText, result.resumeItems[1].date)).toBe("Jun 2025 – Present");

    for (const bulletGrade of bullets) {
      expect(bulletGrade.id).toBeTruthy();
      expect(bulletGrade.label).toMatch(/^B\d+$/);
      expect(bulletGrade).not.toHaveProperty("text");
      expect(Number.isInteger(bulletGrade.grade)).toBe(true);
      expect(bulletGrade.grade).toBe(calculateResumeGrade(bulletGrade.metrics));
      expect(Number.isInteger(bulletGrade.range.start)).toBe(true);
      expect(Number.isInteger(bulletGrade.range.end)).toBe(true);
      expect(bulletGrade.metrics).toHaveLength(result.metrics.length);

      for (const metric of bulletGrade.metrics) {
        expect(metric.label).toBeTruthy();
        expect(Number.isInteger(metric.value)).toBe(true);
        expect(metric.value).toBeGreaterThanOrEqual(0);
        expect(metric.value).toBeLessThanOrEqual(100);
        expect(metric.comments.length).toBeGreaterThan(0);
      }
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

  it("does not invent scores when the resume has no explicit bullets", () => {
    const result = gradeResume({
      sourceName: "resume.pdf",
      parsedText: "Alex Rivera\nSoftware Engineer"
    });

    expect(["S", "A", "B", "C"]).toContain(result.rank);
    expect(result.metrics).toEqual([]);
    expect(result.comments).toEqual([]);
    expect(result.resumeItems).toEqual([]);
    expect(calculateResumeGrade(result.metrics)).toBeNull();
  });

  it("stops a bullet before the next year-range entry header", () => {
    const parsedText =
      "Awards & Achievements\nInternational Collegiate Programming Contest (ICPC) 2023 – 2025\nWorld Finals Qualifier\n• Achieved honors and the best national team performance in 2025 ICPC cycle\nMexican Olympiad of Informatics 2024 – Present\nCoach\n• Coached students representing the state at the Mexican Olympiad in Informatics";
    const result = gradeResume({
      sourceName: "resume.pdf",
      parsedText
    });
    const bullets = result.resumeItems.flatMap((item) => item.bullets);

    expect(result.resumeItems).toHaveLength(2);
    expect(bullets).toHaveLength(2);
    expect(getRangeText(parsedText, bullets[0].range)).toBe(
      "Achieved honors and the best national team performance in 2025 ICPC cycle"
    );
    expect(getRangeText(parsedText, bullets[0].range)).not.toContain("Mexican Olympiad");
    expect(getRangeText(parsedText, result.resumeItems[1].title)).toBe("Mexican Olympiad of Informatics");
    expect(getRangeText(parsedText, result.resumeItems[1].date)).toBe("2024 – Present");
    expect(getRangeText(parsedText, result.resumeItems[1].description)).toBe("Coach");
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

function getRangeText(text: string, range: { start: number; end: number } | null) {
  return range ? text.slice(range.start, range.end).replace(/\s+/g, " ").trim() : null;
}
