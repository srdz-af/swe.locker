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

vi.mock("../db/prisma.js", () => ({
  prisma: prismaMock
}));

const baseResumeRun = {
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
  createdAt: new Date("2026-06-01T00:00:00.000Z")
};

describe("resumeRunService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ]);
    expect(prismaMock.resumeRun.findMany).toHaveBeenCalledWith({
      where: { ownerKey: "local" },
      orderBy: [{ createdAt: "desc" }, { sourceName: "asc" }]
    });
  });

  it("creates a resume run with the modeled fields", async () => {
    prismaMock.resumeRun.create.mockResolvedValue(baseResumeRun);

    await expect(
      createResumeRun({
        id: "resume_run_1",
        sourceName: " alex-rivera-resume.pdf ",
        parsedText: " Alex Rivera\nSoftware Engineer ",
        grade: 86,
        tier: "B",
        verdict: " Solid revision. ",
        metrics: [
          { label: "Structure", value: 90 },
          { label: "Impact", value: 82 }
        ],
        createdAt: "2026-06-01T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      id: "resume_run_1",
      sourceName: "alex-rivera-resume.pdf",
      grade: 86,
      tier: "B"
    });

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
        createdAt: new Date("2026-06-01T00:00:00.000Z")
      }
    });
  });

  it("rejects invalid grade and tier values", async () => {
    await expect(
      createResumeRun({
        sourceName: "resume.pdf",
        parsedText: "Resume",
        grade: 120,
        tier: "B"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid resume run payload."
    } satisfies Partial<HttpError>);

    await expect(
      createResumeRun({
        sourceName: "resume.pdf",
        parsedText: "Resume",
        grade: 90,
        tier: "E"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid resume run payload."
    } satisfies Partial<HttpError>);
    expect(prismaMock.resumeRun.create).not.toHaveBeenCalled();
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
