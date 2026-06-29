import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../errors.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ResumeTier } from "../generated/prisma/client.js";
import { toResumeRunDto } from "./mappers.js";

type ResumeMetricInput = {
  label: string;
  value: number;
};

const resumeTiers = new Set<ResumeTier>(["S", "A", "B", "C"]);

export async function listResumeRuns() {
  const resumeRuns = await prisma.resumeRun.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY
    },
    orderBy: [{ createdAt: "desc" }, { sourceName: "asc" }]
  });

  return resumeRuns.map(toResumeRunDto);
}

export async function createResumeRun(input: {
  id?: string;
  sourceName: string;
  parsedText: string;
  grade?: number | null;
  tier?: string | null;
  verdict?: string | null;
  metrics?: ResumeMetricInput[];
  createdAt?: string;
}) {
  const grade = normalizeGrade(input.grade);
  const tier = normalizeTier(input.tier);
  const sourceName = input.sourceName.trim();
  const parsedText = input.parsedText.trim();
  const createdAt = normalizeCreatedAt(input.createdAt);
  const data = {
    ownerKey: LOCAL_OWNER_KEY,
    sourceName,
    parsedText,
    grade,
    tier,
    verdict: input.verdict?.trim() || null,
    metrics: JSON.stringify(input.metrics ?? []),
    ...(createdAt ? { createdAt } : {})
  };

  if (!sourceName || !parsedText) {
    throw new HttpError(400, "Invalid resume run payload.");
  }

  try {
    const resumeRun = await prisma.resumeRun.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        ...data
      }
    });

    return toResumeRunDto(resumeRun);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "Resume run already exists.");
    }

    throw error;
  }
}

export async function deleteResumeRun(resumeRunId: string) {
  const resumeRun = await prisma.resumeRun.findFirst({
    where: {
      id: resumeRunId,
      ownerKey: LOCAL_OWNER_KEY
    }
  });

  if (!resumeRun) {
    throw new HttpError(404, "Resume run not found.");
  }

  await prisma.resumeRun.delete({
    where: {
      id: resumeRun.id
    }
  });
}

function normalizeGrade(value: number | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new HttpError(400, "Invalid resume run payload.");
  }

  return value;
}

function normalizeTier(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!resumeTiers.has(value as ResumeTier)) {
    throw new HttpError(400, "Invalid resume run payload.");
  }

  return value as ResumeTier;
}

function normalizeCreatedAt(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpError(400, "Invalid resume run payload.");
  }

  return date;
}
