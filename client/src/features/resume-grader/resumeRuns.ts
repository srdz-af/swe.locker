import { resumeMaxFileSizeBytes } from "../../constants";
import type { CreateResumeRunRequest } from "../../../../shared/src/index";
import type { ResumeGraderRun } from "../../types/app";

type PdfTextContentItem = {
  hasEOL: boolean;
  str: string;
};

export function compareResumeRunsByCreatedAtDesc(firstRun: ResumeGraderRun, secondRun: ResumeGraderRun) {
  return getResumeRunTime(secondRun) - getResumeRunTime(firstRun);
}

export function compareResumeRunsByCreatedAtAsc(firstRun: ResumeGraderRun, secondRun: ResumeGraderRun) {
  return getResumeRunTime(firstRun) - getResumeRunTime(secondRun);
}

function getResumeRunTime(run: ResumeGraderRun) {
  const time = Date.parse(run.createdAt);
  return Number.isFinite(time) ? time : 0;
}

export function getResumeRunIdFromChartTarget(target: EventTarget | null, container: HTMLElement) {
  let element = target instanceof Element ? target : null;

  while (element && element !== container) {
    const runId = getResumeRunIdFromChartDatum((element as Element & { __data__?: unknown }).__data__);
    if (runId) {
      return runId;
    }

    element = element.parentElement;
  }

  return null;
}

export function getResumeRunIdFromChartDatum(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const datum = value as { runId?: unknown; datum?: unknown; data?: unknown };
  if (typeof datum.runId === "string") {
    return datum.runId;
  }

  return getResumeRunIdFromChartDatum(datum.datum) ?? getResumeRunIdFromChartDatum(datum.data);
}

export async function extractResumeText(file: File) {
  if (file.size > resumeMaxFileSizeBytes) {
    throw new Error("Upload a resume smaller than 10 MB.");
  }

  const fileName = file.name.toLowerCase();

  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
    return extractPdfResumeText(file);
  }

  if (
    file.type.startsWith("text/") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".markdown")
  ) {
    return normalizeExtractedResumeText(await file.text());
  }

  throw new Error("Upload a PDF, TXT, or Markdown resume.");
}

async function extractPdfResumeText(file: File) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer())
  });
  const document = await documentTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => {
          if (!isPdfTextContentItem(item)) {
            return "";
          }

          return item.hasEOL ? `${item.str}\n` : `${item.str} `;
        })
        .join("");

      pageTexts.push(pageText);
    }
  } finally {
    await document.cleanup();
    await documentTask.destroy();
  }

  return normalizeExtractedResumeText(pageTexts.join("\n\n"));
}

function isPdfTextContentItem(value: unknown): value is PdfTextContentItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "str" in value &&
      typeof value.str === "string" &&
      "hasEOL" in value &&
      typeof value.hasEOL === "boolean"
  );
}

export function normalizeExtractedResumeText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createExtractedResumeRun(file: File, parsedText: string): ResumeGraderRun {
  return {
    id: `resume_run_${Date.now()}`,
    createdAt: new Date().toISOString(),
    sourceName: file.name,
    parsedText,
    grade: null,
    tier: null,
    verdict: "Raw text extracted. Grading is not implemented yet.",
    metrics: []
  };
}

export function toCreateResumeRunRequest(run: ResumeGraderRun): CreateResumeRunRequest {
  return {
    id: run.id,
    sourceName: run.sourceName,
    parsedText: run.parsedText,
    grade: run.grade,
    tier: run.tier,
    verdict: run.verdict,
    metrics: run.metrics,
    createdAt: run.createdAt
  };
}
