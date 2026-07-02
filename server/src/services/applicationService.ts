import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import type { ApplicationEventType, ApplicationStatus } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";
import { toApplicationDto } from "./mappers.js";

const activityWindowDays = 365;
const maxApplicationInterviewRound = 20;
const applicationStatuses = new Set<ApplicationStatus>([
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "DECLINED",
  "GHOSTED",
  "WITHDRAWN"
]);
const applicationEventTypes = new Set<ApplicationEventType>(["CREATED", "STATUS_CHANGED"]);
const applicationEventsInclude = {
  events: {
    orderBy: [{ eventDate: "asc" as const }, { createdAt: "asc" as const }]
  }
};

export async function createApplicationFromPosting(input: {
  jobPostingId: string;
  externalApplicationTrackingUrl?: string | null;
}) {
  const posting = await prisma.jobPosting.findUnique({
    where: {
      id: input.jobPostingId
    }
  });

  if (!posting) {
    throw new HttpError(404, "Posting not found.");
  }

  const existingApplication = await prisma.application.findFirst({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      jobPostingId: posting.id
    },
    include: applicationEventsInclude
  });

  if (existingApplication) {
    if (!existingApplication.archivedAt) {
      return toApplicationDto(existingApplication);
    }

    const restoredApplication = await prisma.$transaction(async (transaction) => {
      const shouldReopenArchivedOutcomeApplication = isArchivedApplicationStatus(existingApplication.status);
      await transaction.application.update({
        where: {
          id: existingApplication.id
        },
        data: {
          archivedAt: null,
          ...(shouldReopenArchivedOutcomeApplication ? { status: "APPLIED" } : {})
        }
      });

      if (shouldReopenArchivedOutcomeApplication) {
        await transaction.applicationEvent.create({
          data: {
            ownerKey: LOCAL_OWNER_KEY,
            applicationId: existingApplication.id,
            previousStatus: existingApplication.status,
            newStatus: "APPLIED",
            eventType: "STATUS_CHANGED"
          }
        });
      }

      const restored = await transaction.application.findUnique({
        where: {
          id: existingApplication.id
        },
        include: applicationEventsInclude
      });

      if (!restored) {
        throw new HttpError(404, "Tracked application not found.");
      }

      return restored;
    });

    return toApplicationDto(restoredApplication);
  }

  const application = await prisma.application.create({
    data: {
      ownerKey: LOCAL_OWNER_KEY,
      jobPostingId: posting.id,
      company: posting.company,
      role: posting.role,
      jobPostingUrl: posting.primaryApplicationUrl ?? posting.simplifyUrl,
      externalApplicationTrackingUrl: input.externalApplicationTrackingUrl?.trim() || null,
      status: "APPLIED",
      events: {
        create: {
          ownerKey: LOCAL_OWNER_KEY,
          newStatus: "APPLIED",
          eventType: "CREATED"
        }
      }
    },
    include: applicationEventsInclude
  });

  return toApplicationDto(application);
}

export async function createManualApplication(input: {
  company: string;
  role: string;
  jobPostingUrl?: string | null;
  externalApplicationTrackingUrl?: string | null;
  status?: string;
}) {
  const status = input.status ?? "APPLIED";
  if (!isApplicationStatus(status)) {
    throw new HttpError(400, "Invalid application status.");
  }

  if (isOfferOutcomeStatus(status)) {
    throw new HttpError(400, "Offer outcome statuses require an existing offer.");
  }

  const application = await prisma.application.create({
    data: {
      ownerKey: LOCAL_OWNER_KEY,
      jobPostingId: null,
      company: input.company.trim(),
      role: input.role.trim(),
      jobPostingUrl: input.jobPostingUrl?.trim() || null,
      externalApplicationTrackingUrl: input.externalApplicationTrackingUrl?.trim() || null,
      status,
      ...(status === "INTERVIEW" ? { interviewRound: 1 } : {}),
      ...(isArchivedApplicationStatus(status) ? { archivedAt: new Date() } : {}),
      events: {
        create: {
          ownerKey: LOCAL_OWNER_KEY,
          newStatus: status,
          eventType: "CREATED"
        }
      }
    },
    include: applicationEventsInclude
  });

  return toApplicationDto(application);
}

export async function listApplications(input: { includeArchived?: boolean } = {}) {
  const applications = await prisma.application.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      ...(input.includeArchived ? {} : { archivedAt: null })
    },
    orderBy: [{ updatedAt: "desc" }, { company: "asc" }, { role: "asc" }],
    include: applicationEventsInclude
  });

  return applications.map(toApplicationDto);
}

export async function updateApplicationStatus(applicationId: string, status: string) {
  if (!isApplicationStatus(status)) {
    throw new HttpError(400, "Invalid application status.");
  }

  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      ownerKey: LOCAL_OWNER_KEY
    },
    include: applicationEventsInclude
  });

  if (!application) {
    throw new HttpError(404, "Tracked application not found.");
  }

  if (application.status === status) {
    return toApplicationDto(application);
  }

  if (isOfferOutcomeStatus(status) && application.status !== "OFFER") {
    throw new HttpError(400, `Applications can only be ${status.toLowerCase()} from an offer.`);
  }

  const updatedApplication = await prisma.$transaction(async (transaction) => {
    await transaction.application.update({
      where: {
        id: application.id
      },
      data: {
        status,
        ...(status === "INTERVIEW" && application.interviewRound === null ? { interviewRound: 1 } : {}),
        archivedAt: isArchivedApplicationStatus(status) ? application.archivedAt ?? new Date() : null
      }
    });

    await transaction.applicationEvent.create({
      data: {
        ownerKey: LOCAL_OWNER_KEY,
        applicationId: application.id,
        previousStatus: application.status,
        newStatus: status,
        eventType: "STATUS_CHANGED"
      }
    });

    const updated = await transaction.application.findUnique({
      where: {
        id: application.id
      },
      include: applicationEventsInclude
    });

    if (!updated) {
      throw new HttpError(404, "Tracked application not found.");
    }

    return updated;
  });

  return toApplicationDto(updatedApplication);
}

export async function updateApplicationDetails(
  applicationId: string,
  input: {
    notes?: string | null;
    interviewDates?: Array<{ label?: string | null; date: string }>;
    interviewRound?: number | null;
    links?: Array<{ label?: string | null; url: string }>;
    submittedResumeRunId?: string | null;
  }
) {
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      ownerKey: LOCAL_OWNER_KEY
    }
  });

  if (!application) {
    throw new HttpError(404, "Tracked application not found.");
  }

  const submittedResumeRunId = await normalizeSubmittedResumeRunId(input);

  const updatedApplication = await prisma.application.update({
    where: {
      id: application.id
    },
    data: {
      ...(Object.hasOwn(input, "notes") ? { notes: input.notes?.trim() || null } : {}),
      ...(input.interviewDates ? { interviewDates: JSON.stringify(input.interviewDates.map(normalizeInterviewDate)) } : {}),
      ...(Object.hasOwn(input, "interviewRound")
        ? { interviewRound: normalizeApplicationInterviewRound(input.interviewRound, "Invalid application details payload.") }
        : {}),
      ...(input.links ? { links: JSON.stringify(input.links.map(normalizeApplicationLink)) } : {}),
      ...(submittedResumeRunId !== undefined ? { submittedResumeRunId } : {})
    },
    include: applicationEventsInclude
  });

  return toApplicationDto(updatedApplication);
}

export async function restoreApplicationSnapshot(input: {
  id: string;
  jobPostingId: string | null;
  company: string;
  role: string;
  jobPostingUrl?: string | null;
  externalApplicationTrackingUrl?: string | null;
  notes?: string | null;
  interviewDates?: Array<{ label?: string | null; date: string }>;
  interviewRound?: number | null;
  links?: Array<{ label?: string | null; url: string }>;
  submittedResumeRunId?: string | null;
  status: string;
  archivedAt?: string | null;
  createdAt?: string;
  events?: Array<{
    id?: string;
    eventType: string;
    previousStatus?: string | null;
    newStatus: string;
    eventDate: string;
    createdAt: string;
  }>;
}) {
  if (!input.id.trim() || !input.company.trim() || !input.role.trim() || !isApplicationStatus(input.status)) {
    throw new HttpError(400, "Invalid application restore payload.");
  }

  const submittedResumeRunId = await normalizeSubmittedResumeRunId({
    submittedResumeRunId: input.submittedResumeRunId ?? null
  });
  const createdAt = input.createdAt ? normalizeDateTime(input.createdAt, "Invalid application restore payload.") : undefined;
  const archivedAt = input.archivedAt ? normalizeDateTime(input.archivedAt, "Invalid application restore payload.") : null;
  const eventInputs = normalizeApplicationRestoreEvents(input, createdAt);
  const applicationData = {
    ownerKey: LOCAL_OWNER_KEY,
    jobPostingId: input.jobPostingId?.trim() || null,
    company: input.company.trim(),
    role: input.role.trim(),
    jobPostingUrl: input.jobPostingUrl?.trim() || null,
    externalApplicationTrackingUrl: input.externalApplicationTrackingUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    interviewDates: JSON.stringify((input.interviewDates ?? []).map(normalizeInterviewDate)),
    interviewRound:
      normalizeApplicationInterviewRound(input.interviewRound, "Invalid application restore payload.") ??
      (input.status === "INTERVIEW" ? 1 : null),
    links: JSON.stringify((input.links ?? []).map(normalizeApplicationLink)),
    submittedResumeRunId,
    status: input.status,
    archivedAt,
    ...(createdAt ? { createdAt } : {})
  };

  const restoredApplication = await prisma.$transaction(async (transaction) => {
    const existingApplication = await transaction.application.findFirst({
      where: {
        id: input.id,
        ownerKey: LOCAL_OWNER_KEY
      }
    });

    if (existingApplication) {
      await transaction.application.update({
        where: {
          id: existingApplication.id
        },
        data: applicationData
      });
      await transaction.applicationEvent.deleteMany({
        where: {
          applicationId: existingApplication.id,
          ownerKey: LOCAL_OWNER_KEY
        }
      });
    } else {
      await transaction.application.create({
        data: {
          id: input.id,
          ...applicationData
        }
      });
    }

    for (const eventInput of eventInputs) {
      await transaction.applicationEvent.create({
        data: {
          ...(eventInput.id ? { id: eventInput.id } : {}),
          ownerKey: LOCAL_OWNER_KEY,
          applicationId: input.id,
          eventType: eventInput.eventType,
          previousStatus: eventInput.previousStatus,
          newStatus: eventInput.newStatus,
          eventDate: eventInput.eventDate,
          createdAt: eventInput.createdAt
        }
      });
    }

    const restored = await transaction.application.findUnique({
      where: {
        id: input.id
      },
      include: applicationEventsInclude
    });

    if (!restored) {
      throw new HttpError(404, "Tracked application not found.");
    }

    return restored;
  });

  return toApplicationDto(restoredApplication);
}

function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.has(value as ApplicationStatus);
}

function isArchivedApplicationStatus(status: ApplicationStatus) {
  return status === "DECLINED" || status === "GHOSTED" || status === "WITHDRAWN";
}

function isOfferOutcomeStatus(status: ApplicationStatus) {
  return status === "DECLINED" || status === "HIRED";
}

function isApplicationEventType(value: string): value is ApplicationEventType {
  return applicationEventTypes.has(value as ApplicationEventType);
}

export async function listApplicationActivity(input: { year?: number } = {}) {
  const today = getUtcDateOnly(new Date());
  const currentYear = today.getUTCFullYear();
  const selectedYear = input.year ?? currentYear;
  const startDate = selectedYear === currentYear ? new Date(today) : new Date(Date.UTC(selectedYear, 0, 1));
  const endDate = selectedYear === currentYear ? new Date(today) : new Date(Date.UTC(selectedYear, 11, 31));

  if (selectedYear === currentYear) {
    startDate.setUTCDate(today.getUTCDate() - activityWindowDays + 1);
  }

  const endExclusive = new Date(endDate);
  endExclusive.setUTCDate(endDate.getUTCDate() + 1);

  const applications = await prisma.application.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      createdAt: {
        gte: startDate,
        lt: endExclusive
      }
    },
    select: {
      createdAt: true
    }
  });

  const countsByDate = new Map<string, number>();
  for (const application of applications) {
    const key = toDateKey(application.createdAt);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }

  const dayCount = Math.round((endExclusive.getTime() - startDate.getTime()) / 86_400_000);

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    const key = toDateKey(date);

    return {
      date: key,
      count: countsByDate.get(key) ?? 0
    };
  });
}

export async function deleteApplication(applicationId: string) {
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      ownerKey: LOCAL_OWNER_KEY
    }
  });

  if (!application) {
    throw new HttpError(404, "Tracked application not found.");
  }

  await prisma.application.delete({
    where: {
      id: application.id
    }
  });
}

export async function purgeArchivedApplications() {
  const result = await prisma.application.deleteMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      archivedAt: {
        not: null
      }
    }
  });

  return {
    deletedCount: result.count
  };
}

export async function archiveApplication(applicationId: string) {
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      ownerKey: LOCAL_OWNER_KEY,
      archivedAt: null
    }
  });

  if (!application) {
    throw new HttpError(404, "Tracked application not found.");
  }

  const archivedApplication = await prisma.application.update({
    where: {
      id: application.id
    },
    data: {
      archivedAt: new Date()
    },
    include: applicationEventsInclude
  });

  return toApplicationDto(archivedApplication);
}

export async function unarchiveApplication(applicationId: string) {
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      ownerKey: LOCAL_OWNER_KEY
    }
  });

  if (!application) {
    throw new HttpError(404, "Tracked application not found.");
  }

  if (!application.archivedAt) {
    return toApplicationDto({ ...application, events: [] });
  }

  const nextStatus = isArchivedApplicationStatus(application.status) ? "APPLIED" : application.status;
  const unarchivedApplication = await prisma.$transaction(async (transaction) => {
    await transaction.application.update({
      where: {
        id: application.id
      },
      data: {
        archivedAt: null,
        status: nextStatus
      }
    });

    if (nextStatus !== application.status) {
      await transaction.applicationEvent.create({
        data: {
          ownerKey: LOCAL_OWNER_KEY,
          applicationId: application.id,
          previousStatus: application.status,
          newStatus: nextStatus,
          eventType: "STATUS_CHANGED"
        }
      });
    }

    const updated = await transaction.application.findUnique({
      where: {
        id: application.id
      },
      include: applicationEventsInclude
    });

    if (!updated) {
      throw new HttpError(404, "Tracked application not found.");
    }

    return updated;
  });

  return toApplicationDto(unarchivedApplication);
}

function getUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeInterviewDate(value: { label?: string | null; date: string }) {
  const date = normalizeDateTime(value.date, "Invalid application details payload.");

  return {
    label: value.label?.trim() || null,
    date: date.toISOString()
  };
}

function normalizeApplicationInterviewRound(value: number | null | undefined, errorMessage: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 1 || value > maxApplicationInterviewRound) {
    throw new HttpError(400, errorMessage);
  }

  return value;
}

function normalizeApplicationRestoreEvents(
  input: {
    status: string;
    createdAt?: string;
    events?: Array<{
      id?: string;
      eventType: string;
      previousStatus?: string | null;
      newStatus: string;
      eventDate: string;
      createdAt: string;
    }>;
  },
  applicationCreatedAt: Date | undefined
) {
  const fallbackDate = applicationCreatedAt ?? new Date();
  const events =
    input.events && input.events.length > 0
      ? input.events
      : [
          {
            eventType: "CREATED",
            previousStatus: null,
            newStatus: input.status,
            eventDate: fallbackDate.toISOString(),
            createdAt: fallbackDate.toISOString()
          }
        ];

  return events.map((event) => {
    if (!isApplicationEventType(event.eventType) || !isApplicationStatus(event.newStatus)) {
      throw new HttpError(400, "Invalid application restore payload.");
    }

    const previousStatus = event.previousStatus?.trim() || null;
    if (previousStatus !== null && !isApplicationStatus(previousStatus)) {
      throw new HttpError(400, "Invalid application restore payload.");
    }

    return {
      id: event.id?.trim() || undefined,
      eventType: event.eventType,
      previousStatus,
      newStatus: event.newStatus,
      eventDate: normalizeDateTime(event.eventDate, "Invalid application restore payload."),
      createdAt: normalizeDateTime(event.createdAt, "Invalid application restore payload.")
    };
  });
}

function normalizeDateTime(value: string, errorMessage: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpError(400, errorMessage);
  }

  return date;
}

function normalizeApplicationLink(link: { label?: string | null; url: string }) {
  return {
    label: link.label?.trim() || null,
    url: link.url.trim()
  };
}

async function normalizeSubmittedResumeRunId(input: { submittedResumeRunId?: string | null }) {
  if (!Object.hasOwn(input, "submittedResumeRunId")) {
    return undefined;
  }

  const submittedResumeRunId = input.submittedResumeRunId?.trim() || null;
  if (!submittedResumeRunId) {
    return null;
  }

  const resumeRun = await prisma.resumeRun.findFirst({
    where: {
      id: submittedResumeRunId,
      ownerKey: LOCAL_OWNER_KEY
    },
    select: {
      id: true
    }
  });

  if (!resumeRun) {
    throw new HttpError(404, "Resume run not found.");
  }

  return resumeRun.id;
}
