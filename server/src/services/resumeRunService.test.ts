import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.js";
import { createResumeRun, deleteResumeRun, listResumeRuns } from "./resumeRunService.js";

const prismaMock = vi.hoisted(() => ({
  resumeRun: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn()
  }
}));

const resumeGraderMock = vi.hoisted(() => ({
  calculateResumeGrade: vi.fn((metrics: Array<{ value: number }>) =>
    metrics.length === 0 ? null : Math.round(metrics.reduce((total, metric) => total + metric.value, 0) / metrics.length)
  ),
  gradeResume: vi.fn()
}));

vi.mock("../db/prisma.js", () => ({
  prisma: prismaMock
}));

vi.mock("../grading/resumeGrader.js", () => resumeGraderMock);

const baseResumeRun = {
  id: "resume_run_1",
  ownerKey: "local",
  sourceName: "alex-rivera-resume.pdf",
  parsedText: "Alex Rivera\nSoftware Engineer",
  grade: 12,
  tier: "B",
  verdict: "Solid revision.",
  metrics: JSON.stringify([
    { label: "Structure", value: 90 },
    { label: "Impact", value: 82 }
  ]),
  comments: JSON.stringify([
    {
      id: "rank",
      label: "Signal",
      scoreLabel: "Signal B",
      comments: [{ id: "rank-comment-1", start: 0, end: 11, text: "Strong profile." }]
    }
  ]),
  createdAt: new Date("2026-06-01T00:00:00.000Z")
};

describe("resumeRunService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resumeGraderMock.gradeResume.mockReturnValue({
      rank: "B",
      verdict: "Temporary random grading result.",
      metrics: [
        { label: "Structure", value: 90 },
        { label: "Impact", value: 82 }
      ],
      comments: [
        {
          id: "rank",
          label: "Signal",
          scoreLabel: "Signal B",
          comments: [{ id: "rank-comment-1", start: 0, end: 11, text: "Strong profile." }]
        }
      ]
    });
  });

  it("lists resume runs for the local owner", async () => {
    prismaMock.resumeRun.findMany.mockResolvedValue([baseResumeRun]);

    await expect(listResumeRuns()).resolves.toEqual([
      {
        id: "resume_run_1",
        sourceName: "alex-rivera-resume.pdf",
        parsedText: "Alex Rivera\nSoftware Engineer",
        grade: 86,
        tier: "B",
        verdict: "Solid revision.",
        metrics: [
          { label: "Structure", value: 90 },
          { label: "Impact", value: 82 }
        ],
        comments: [
          {
            id: "rank",
            label: "Signal",
            scoreLabel: "Signal B",
            comments: [{ id: "rank-comment-1", start: 0, end: 11, text: "Strong profile." }]
          }
        ],
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ]);
    expect(prismaMock.resumeRun.findMany).toHaveBeenCalledWith({
      where: { ownerKey: "local" },
      orderBy: [{ createdAt: "desc" }, { sourceName: "asc" }]
    });
  });

  it("creates a resume run from backend grader metrics", async () => {
    prismaMock.resumeRun.create.mockResolvedValue(baseResumeRun);

    await expect(
      createResumeRun({
        id: "resume_run_1",
        sourceName: " alex-rivera-resume.pdf ",
        parsedText: " Alex Rivera\nSoftware Engineer ",
        createdAt: "2026-06-01T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      id: "resume_run_1",
      sourceName: "alex-rivera-resume.pdf",
      grade: 86,
      tier: "B"
    });

    expect(resumeGraderMock.gradeResume).toHaveBeenCalledWith({
      sourceName: "alex-rivera-resume.pdf",
      parsedText: "Alex Rivera\nSoftware Engineer"
    });
    expect(prismaMock.resumeRun.create).toHaveBeenCalledWith({
      data: {
        id: "resume_run_1",
        ownerKey: "local",
        sourceName: "alex-rivera-resume.pdf",
        parsedText: "Alex Rivera\nSoftware Engineer",
        grade: 86,
        tier: "B",
        verdict: "Temporary random grading result.",
        metrics: JSON.stringify([
          { label: "Structure", value: 90 },
          { label: "Impact", value: 82 }
        ]),
        comments: JSON.stringify([
          {
            id: "rank",
            label: "Signal",
            scoreLabel: "Signal B",
            comments: [{ id: "rank-comment-1", start: 0, end: 11, text: "Strong profile." }]
          }
        ]),
        createdAt: new Date("2026-06-01T00:00:00.000Z")
      }
    });
  });

  it("ignores client-supplied grading fields", async () => {
    prismaMock.resumeRun.create.mockResolvedValue(baseResumeRun);

    await expect(
      createResumeRun({
        sourceName: "resume.pdf",
        parsedText: "Alex Rivera\nSoftware Engineer",
        grade: 0,
        tier: "C",
        verdict: "Client verdict.",
        metrics: [],
        comments: []
      } as Parameters<typeof createResumeRun>[0] & {
        grade: number;
        tier: string;
        verdict: string;
        metrics: [];
        comments: [];
      })
    ).resolves.toMatchObject({
      grade: 86,
      tier: "B"
    });

    expect(prismaMock.resumeRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grade: 86,
          tier: "B",
          verdict: "Temporary random grading result.",
          metrics: JSON.stringify([
            { label: "Structure", value: 90 },
            { label: "Impact", value: 82 }
          ]),
          comments: JSON.stringify([
            {
              id: "rank",
              label: "Signal",
              scoreLabel: "Signal B",
              comments: [{ id: "rank-comment-1", start: 0, end: 11, text: "Strong profile." }]
            }
          ])
        })
      })
    );
  });

  it("deletes a resume run for the local owner", async () => {
    prismaMock.resumeRun.findFirst.mockResolvedValue(baseResumeRun);
    prismaMock.resumeRun.delete.mockResolvedValue(baseResumeRun);

    await expect(deleteResumeRun("resume_run_1")).resolves.toBeUndefined();
    expect(prismaMock.resumeRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: "resume_run_1",
        ownerKey: "local"
      }
    });
    expect(prismaMock.resumeRun.delete).toHaveBeenCalledWith({
      where: { id: "resume_run_1" }
    });
  });

  it("rejects missing resume runs on delete", async () => {
    prismaMock.resumeRun.findFirst.mockResolvedValue(null);

    await expect(deleteResumeRun("missing")).rejects.toMatchObject({
      statusCode: 404,
      message: "Resume run not found."
    } satisfies Partial<HttpError>);
    expect(prismaMock.resumeRun.delete).not.toHaveBeenCalled();
  });
});
