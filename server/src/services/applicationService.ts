import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import type { ApplicationStatus } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";
import { toApplicationDto } from "./mappers.js";

const activityWindowDays = 365;
const applicationStatuses = new Set<ApplicationStatus>(["APPLIED", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]);
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

    const restoredApplication = await prisma.application.update({
      where: {
        id: existingApplication.id
      },
      data: {
        archivedAt: null
      },
      include: applicationEventsInclude
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

export async function listApplications() {
  const applications = await prisma.application.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      archivedAt: null
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
      ownerKey: LOCAL_OWNER_KEY,
      archivedAt: null
    },
    include: applicationEventsInclude
  });

  if (!application) {
    throw new HttpError(404, "Tracked application not found.");
  }

  if (application.status === status) {
    return toApplicationDto(application);
  }

  const updatedApplication = await prisma.$transaction(async (transaction) => {
    await transaction.application.update({
      where: {
        id: application.id
      },
      data: {
        status
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

function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.has(value as ApplicationStatus);
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

  const events = await prisma.applicationEvent.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      eventDate: {
        gte: startDate,
        lt: endExclusive
      }
    },
    select: {
      eventDate: true
    }
  });

  const countsByDate = new Map<string, number>();
  for (const event of events) {
    const key = toDateKey(event.eventDate);
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

function getUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
