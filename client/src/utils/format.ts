import type { ApplicationStatus } from "../../../shared/src/index";
import { applicationStatuses } from "../constants";

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function getApplicationStatusLabel(status: ApplicationStatus) {
  return applicationStatuses.find((option) => option.status === status)?.label ?? status;
}

export function formatApplicationCount(value: number) {
  return `${value} application${value === 1 ? "" : "s"}`;
}

export function formatApplicationTooltipValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatApplicationCount(value);
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    const countMatch = trimmedValue.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);

    if (countMatch) {
      const count = Number(countMatch[1]);
      const unit = countMatch[2].trim().toLowerCase();

      if (Number.isFinite(count) && (!unit || unit.startsWith("application"))) {
        return formatApplicationCount(count);
      }
    }

    return trimmedValue;
  }

  if (value && typeof value === "object" && "value" in value) {
    return formatApplicationTooltipValue((value as { value?: unknown }).value);
  }

  return "0 applications";
}
