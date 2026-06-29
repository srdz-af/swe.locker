import type { ApplicationStatus } from "../../shared/src/index";
import type { ManualApplicationFormState } from "./types/app";

export const themeStorageKey = "swe.locker.theme";
export const darkPreferenceQuery = "(prefers-color-scheme: dark)";
export const resumeAcceptedFileTypes = [".pdf", ".txt", ".md", "application/pdf", "text/plain", "text/markdown"];
export const resumeMaxFileSizeBytes = 10 * 1024 * 1024;

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
