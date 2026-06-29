import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../errors.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ResumeTier } from "../generated/prisma/client.js";
import { calculateResumeGrade, gradeResume } from "../grading/resumeGrader.js";
import type { ResumeGradeCommentGroup, ResumeGradeMetric, ResumeRank } from "../grading/resumeGrader.js";
import { toResumeRunDto } from "./mappers.js";

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
  createdAt?: string;
}) {
  const sourceName = input.sourceName.trim();
  const parsedText = input.parsedText.trim();
  const createdAt = normalizeCreatedAt(input.createdAt);

  if (!sourceName || !parsedText) {
    throw new HttpError(400, "Invalid resume run payload.");
  }

  const gradingResult = gradeResume({
    sourceName,
    parsedText
  });
  const tier = normalizeGraderRank(gradingResult.rank);
  const metrics = normalizeGraderMetrics(gradingResult.metrics);
  const comments = normalizeGraderCommentGroups(gradingResult.comments ?? [], parsedText);
  const grade = calculateResumeGrade(metrics);

  if (grade === null) {
    throw new Error("Resume grader returned invalid metrics.");
  }

  const data = {
    ownerKey: LOCAL_OWNER_KEY,
    sourceName,
    parsedText,
    grade,
    tier,
    verdict: gradingResult.verdict.trim() || null,
    metrics: JSON.stringify(metrics),
    comments: JSON.stringify(comments),
    ...(createdAt ? { createdAt } : {})
  };

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

function normalizeGraderRank(value: ResumeRank) {
  if (!resumeTiers.has(value as ResumeTier)) {
    throw new Error("Resume grader returned an invalid rank.");
  }

  return value as ResumeTier;
}

function normalizeGraderMetrics(metrics: ResumeGradeMetric[]) {
  return metrics.map((metric) => {
    const label = metric.label.trim();

    if (!label || !Number.isInteger(metric.value) || metric.value < 0 || metric.value > 100) {
      throw new Error("Resume grader returned invalid metrics.");
    }

    return {
      label,
      value: metric.value
    };
  });
}

function normalizeGraderCommentGroups(commentGroups: ResumeGradeCommentGroup[], parsedText: string) {
  return commentGroups
    .map((commentGroup, groupIndex) => {
      const label = commentGroup.label.trim();
      const scoreLabel = commentGroup.scoreLabel.trim();
      const id = commentGroup.id.trim() || `comment-group-${groupIndex}`;

      if (!label || !scoreLabel || !Array.isArray(commentGroup.comments)) {
        throw new Error("Resume grader returned invalid comments.");
      }

      const comments = commentGroup.comments.map((comment, commentIndex) => {
        const text = comment.text.trim();
        const commentId = comment.id.trim() || `${id}-comment-${commentIndex}`;

        if (
          !text ||
          !Number.isInteger(comment.start) ||
          !Number.isInteger(comment.end) ||
          comment.start < 0 ||
          comment.end <= comment.start ||
          comment.end > parsedText.length
        ) {
          throw new Error("Resume grader returned invalid comments.");
        }

        return {
          id: commentId,
          start: comment.start,
          end: comment.end,
          text
        };
      });

      return {
        id,
        label,
        scoreLabel,
        comments
      };
    })
    .filter((commentGroup) => commentGroup.comments.length > 0);
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
