import type { ApplicationStatus } from "../../shared/src/index";
import type { ManualApplicationFormState } from "./types/app";

export const themeStorageKey = "swe.locker.theme";
export const darkPreferenceQuery = "(prefers-color-scheme: dark)";
export const resumeAcceptedFileTypes = [".pdf", ".txt", ".md", "application/pdf", "text/plain", "text/markdown"];
export const resumeMaxFileSizeBytes = 10 * 1024 * 1024;
export const resumeGradeFallbackColor = "#0f62fe";

export const resumeGradeColorStops = [
  { min: 0, color: "#da1e28" },
  { min: 40, color: "#eb6200" },
  { min: 55, color: "#f1c21b" },
  { min: 70, color: "#42be65" },
  { min: 80, color: "#24a148" },
  { min: 90, color: "#198038" }
] as const;

export function getResumeGradeColor(grade: number | null | undefined) {
  if (grade === null || grade === undefined) {
    return resumeGradeFallbackColor;
  }

  const normalizedGrade = Math.max(0, Math.min(100, grade));
  return [...resumeGradeColorStops].reverse().find((stop) => normalizedGrade >= stop.min)?.color ?? resumeGradeFallbackColor;
}

export const applicationStatusColors: Record<ApplicationStatus, string> = {
  APPLIED: "#009d9a",
  INTERVIEW: "#8a3ffc",
  OFFER: "#24a148",
  HIRED: "#0f62fe",
  REJECTED: "#d02670"
};

export const applicationStatuses: Array<{ status: ApplicationStatus; label: string; color: string }> = [
  { status: "APPLIED", label: "Applied", color: applicationStatusColors.APPLIED },
  { status: "INTERVIEW", label: "Interview", color: applicationStatusColors.INTERVIEW },
  { status: "OFFER", label: "Offer", color: applicationStatusColors.OFFER },
  { status: "HIRED", label: "Hired", color: applicationStatusColors.HIRED },
  { status: "REJECTED", label: "Rejected", color: applicationStatusColors.REJECTED }
];

export function getApplicationStatusColor(status: ApplicationStatus) {
  return applicationStatusColors[status];
}

export const initialManualApplicationForm: ManualApplicationFormState = {
  company: "",
  role: "",
  jobPostingUrl: "",
  externalApplicationTrackingUrl: "",
  status: "APPLIED"
};
