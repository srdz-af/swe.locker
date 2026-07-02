import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.js";
import { createResumeRun, deleteResumeRun, listResumeRuns, restoreResumeRunSnapshot } from "./resumeRunService.js";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  resumeRun: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn()
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

const baseResumeItems = [
  {
    id: "resume-item-1",
    title: { start: 0, end: 11 },
    description: null,
    date: null,
    bullets: [
      {
        id: "bullet-1",
        label: "B1",
        grade: 86,
        range: { start: 12, end: 29 },
        bulletIndex: 1,
        metrics: [
          {
            label: "Structure",
            value: 90,
            comments: [{ id: "bullet-1-structure-comment-0", start: 12, end: 29, text: "Clear structure." }]
          },
          {
            label: "Impact",
            value: 82,
            comments: [{ id: "bullet-1-impact-comment-0", start: 12, end: 29, text: "Add stronger impact." }]
          }
        ]
      }
    ]
  }
];

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
  bulletGrades: JSON.stringify(baseResumeItems),
  createdAt: new Date("2026-06-01T00:00:00.000Z")
};

describe("resumeRunService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
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
      ],
      resumeItems: baseResumeItems
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
        resumeItems: baseResumeItems,
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ]);
    expect(prismaMock.resumeRun.findMany).toHaveBeenCalledWith({
      where: { ownerKey: "local" },
      orderBy: [{ createdAt: "desc" }, { sourceName: "asc" }]
    });
  });

  it("maps legacy flat bullet rows into resume items", async () => {
    const legacyBulletGrades = [
      {
        id: "bullet-1",
        label: "B1",
        text: "Software Engineer",
        grade: 86,
        start: 12,
        end: 29,
        bulletIndex: 1,
        sectionTitle: null,
        entryTitle: "Alex Rivera",
        metrics: baseResumeItems[0].bullets[0].metrics
      }
    ];
    prismaMock.resumeRun.findMany.mockResolvedValue([
      {
        ...baseResumeRun,
        bulletGrades: JSON.stringify(legacyBulletGrades)
      }
    ]);

    await expect(listResumeRuns()).resolves.toMatchObject([
      {
        grade: 86,
        resumeItems: [
          {
            title: null,
            description: null,
            date: null,
            bullets: [
              {
                id: "bullet-1",
                label: "B1",
                grade: 86,
                range: { start: 12, end: 29 },
                bulletIndex: 1
              }
            ]
          }
        ]
      }
    ]);
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
        bulletGrades: JSON.stringify(baseResumeItems),
        createdAt: new Date("2026-06-01T00:00:00.000Z")
      }
    });
  });

  it("uses the average bullet grade as the stored numeric grade", async () => {
    const resumeItems = [
      {
        ...baseResumeItems[0],
        bullets: [
          {
            ...baseResumeItems[0].bullets[0],
            id: "bullet-1",
            label: "B1",
            grade: 90,
            metrics: [
              { label: "Structure", value: 10, comments: [{ id: "bullet-1-structure-comment-0", start: 12, end: 29, text: "Structure note." }] },
              { label: "Impact", value: 20, comments: [{ id: "bullet-1-impact-comment-0", start: 12, end: 29, text: "Impact note." }] }
            ]
          },
          {
            ...baseResumeItems[0].bullets[0],
            id: "bullet-2",
            label: "B2",
            grade: 80,
            range: { start: 30, end: 51 },
            bulletIndex: 2,
            metrics: [
              { label: "Structure", value: 30, comments: [{ id: "bullet-2-structure-comment-0", start: 30, end: 51, text: "Structure note." }] },
              { label: "Impact", value: 40, comments: [{ id: "bullet-2-impact-comment-0", start: 30, end: 51, text: "Impact note." }] }
            ]
          }
        ]
      }
    ];
    resumeGraderMock.gradeResume.mockReturnValue({
      rank: "A",
      verdict: "Temporary random grading result.",
      metrics: [
        { label: "Structure", value: 20 },
        { label: "Impact", value: 30 }
      ],
      comments: [],
      resumeItems
    });
    prismaMock.resumeRun.create.mockResolvedValue({
      ...baseResumeRun,
      grade: 85,
      tier: "A",
      metrics: JSON.stringify([
        { label: "Structure", value: 20 },
        { label: "Impact", value: 30 }
      ]),
      comments: "[]",
      bulletGrades: JSON.stringify(resumeItems)
    });

    await expect(
      createResumeRun({
        sourceName: "resume.pdf",
        parsedText: "Alex Rivera\nSoftware Engineer\nBuilt a data pipeline"
      })
    ).resolves.toMatchObject({
      grade: 85,
      tier: "A"
    });

    expect(prismaMock.resumeRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grade: 85,
          tier: "A",
          metrics: JSON.stringify([
            { label: "Structure", value: 20 },
            { label: "Impact", value: 30 }
          ]),
          bulletGrades: JSON.stringify(resumeItems)
        })
      })
    );
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
          ]),
          bulletGrades: JSON.stringify(baseResumeItems)
        })
      })
    );
  });

  it("persists an ungraded run when no explicit bullets are available", async () => {
    resumeGraderMock.gradeResume.mockReturnValue({
      rank: "B",
      verdict: "No explicit resume bullets found to grade.",
      metrics: [],
      comments: [],
      resumeItems: []
    });
    const ungradedResumeRun = {
      ...baseResumeRun,
      grade: null,
      tier: "B",
      verdict: "No explicit resume bullets found to grade.",
      metrics: "[]",
      comments: "[]",
      bulletGrades: "[]"
    };
    prismaMock.resumeRun.create.mockResolvedValue(ungradedResumeRun);

    await expect(
      createResumeRun({
        sourceName: "resume.pdf",
        parsedText: "Alex Rivera\nSoftware Engineer"
      })
    ).resolves.toMatchObject({
      grade: null,
      tier: "B",
      metrics: [],
      resumeItems: []
    });

    expect(prismaMock.resumeRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grade: null,
          tier: "B",
          metrics: "[]",
          comments: "[]",
          bulletGrades: "[]"
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

  it("restores a resume run snapshot without grading it again", async () => {
    prismaMock.resumeRun.findFirst.mockResolvedValue(null);
    prismaMock.resumeRun.create.mockResolvedValue(baseResumeRun);

    await expect(
      restoreResumeRunSnapshot({
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
        resumeItems: baseResumeItems,
        createdAt: "2026-06-01T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      id: "resume_run_1",
      grade: 86,
      tier: "B"
    });
    expect(resumeGraderMock.gradeResume).not.toHaveBeenCalled();
    expect(prismaMock.resumeRun.create).toHaveBeenCalledWith({
      data: {
        id: "resume_run_1",
        ownerKey: "local",
        sourceName: "alex-rivera-resume.pdf",
        parsedText: "Alex Rivera\nSoftware Engineer",
        grade: 86,
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
        bulletGrades: JSON.stringify(baseResumeItems),
        createdAt: new Date("2026-06-01T00:00:00.000Z")
      }
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
