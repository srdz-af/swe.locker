import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../errors.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ResumeTier } from "../generated/prisma/client.js";
import { calculateResumeGrade, gradeResume } from "../grading/resumeGrader.js";
import type { ResumeGradeCommentGroup, ResumeGradeItem, ResumeGradeMetric, ResumeRank, ResumeTextRange } from "../grading/resumeGrader.js";
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
  const resumeItems = normalizeGraderResumeItems(gradingResult.resumeItems ?? [], parsedText);
  const grade = calculateResumeGradeFromBulletGrades(flattenResumeItemBulletGrades(resumeItems));

  const data = {
    ownerKey: LOCAL_OWNER_KEY,
    sourceName,
    parsedText,
    grade,
    tier,
    verdict: gradingResult.verdict.trim() || null,
    metrics: JSON.stringify(metrics),
    comments: JSON.stringify(comments),
    bulletGrades: JSON.stringify(resumeItems),
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

function normalizeGraderResumeItems(resumeItems: ResumeGradeItem[], parsedText: string) {
  return resumeItems
    .map((item, itemIndex) => {
      const id = item.id.trim() || `resume-item-${itemIndex + 1}`;

      if (!id || !Array.isArray(item.bullets)) {
        throw new Error("Resume grader returned invalid resume items.");
      }

      const bullets = item.bullets
        .map((bulletGrade, bulletIndex) => {
          const bulletId = bulletGrade.id.trim() || `bullet-${bulletIndex + 1}`;
          const label = bulletGrade.label.trim() || `B${bulletGrade.bulletIndex || bulletIndex + 1}`;
          const range = normalizeGraderTextRange(bulletGrade.range, parsedText, "Resume grader returned invalid bullet grades.");

          if (
            !bulletId ||
            !label ||
            !Number.isInteger(bulletGrade.bulletIndex) ||
            bulletGrade.bulletIndex < 1 ||
            !Array.isArray(bulletGrade.metrics)
          ) {
            throw new Error("Resume grader returned invalid bullet grades.");
          }

          const metrics = bulletGrade.metrics.map((metric, metricIndex) => {
            const metricLabel = metric.label.trim();

            if (
              !metricLabel ||
              !Number.isInteger(metric.value) ||
              metric.value < 0 ||
              metric.value > 100 ||
              !Array.isArray(metric.comments)
            ) {
              throw new Error("Resume grader returned invalid bullet grades.");
            }

            const comments = metric.comments.map((comment, commentIndex) => {
              const commentText = comment.text.trim();
              const commentId = comment.id.trim() || `${bulletId}-metric-${metricIndex}-comment-${commentIndex}`;

              if (
                !commentText ||
                !Number.isInteger(comment.start) ||
                !Number.isInteger(comment.end) ||
                comment.start < 0 ||
                comment.end <= comment.start ||
                comment.end > parsedText.length
              ) {
                throw new Error("Resume grader returned invalid bullet grades.");
              }

              return {
                id: commentId,
                start: comment.start,
                end: comment.end,
                text: commentText
              };
            });

            return {
              label: metricLabel,
              value: metric.value,
              comments
            };
          });
          const computedGrade = calculateResumeGrade(metrics);
          const grade = Number.isInteger(bulletGrade.grade) ? bulletGrade.grade : computedGrade;

          if (grade === null || grade < 0 || grade > 100) {
            throw new Error("Resume grader returned invalid bullet grades.");
          }

          return {
            id: bulletId,
            label,
            grade,
            range,
            bulletIndex: bulletGrade.bulletIndex,
            metrics
          };
        })
        .filter((bulletGrade) => bulletGrade.metrics.length > 0);

      return {
        id,
        title: normalizeNullableGraderTextRange(item.title, parsedText, "Resume grader returned invalid resume items."),
        description: normalizeNullableGraderTextRange(item.description, parsedText, "Resume grader returned invalid resume items."),
        date: normalizeNullableGraderTextRange(item.date, parsedText, "Resume grader returned invalid resume items."),
        bullets
      };
    })
    .filter((item) => item.bullets.length > 0);
}

function calculateResumeGradeFromBulletGrades(bulletGrades: Array<{ grade: number }>) {
  if (bulletGrades.length === 0) {
    return null;
  }

  const total = bulletGrades.reduce((sum, bulletGrade) => sum + bulletGrade.grade, 0);
  return Math.round(total / bulletGrades.length);
}

function flattenResumeItemBulletGrades(resumeItems: Array<{ bullets: Array<{ grade: number }> }>) {
  return resumeItems.flatMap((item) => item.bullets);
}

function normalizeNullableGraderTextRange(range: ResumeTextRange | null, parsedText: string, errorMessage: string) {
  return range ? normalizeGraderTextRange(range, parsedText, errorMessage) : null;
}

function normalizeGraderTextRange(range: ResumeTextRange, parsedText: string, errorMessage: string) {
  if (
    !range ||
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end <= range.start ||
    range.end > parsedText.length
  ) {
    throw new Error(errorMessage);
  }

  return {
    start: range.start,
    end: range.end
  };
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
