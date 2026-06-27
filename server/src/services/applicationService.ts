import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import type { ApplicationStatus } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";
import { toApplicationDto } from "./mappers.js";

const activityWindowDays = 365;
const applicationStatuses = new Set<ApplicationStatus>(["APPLIED", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]);

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
    }
  });

  if (existingApplication) {
    return toApplicationDto(existingApplication);
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
    }
  });

  return toApplicationDto(application);
}

export async function listApplications() {
  const applications = await prisma.application.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY
    },
    orderBy: [{ updatedAt: "desc" }, { company: "asc" }, { role: "asc" }]
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
    }
  });

  if (!application) {
    throw new HttpError(404, "Tracked application not found.");
  }

  if (application.status === status) {
    return toApplicationDto(application);
  }

  const updatedApplication = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.application.update({
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

    return updated;
  });

  return toApplicationDto(updatedApplication);
}

function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.has(value as ApplicationStatus);
}

export async function listApplicationActivity() {
  const today = getUtcDateOnly(new Date());
  const startDate = new Date(today);
  startDate.setUTCDate(today.getUTCDate() - activityWindowDays + 1);

  const events = await prisma.applicationEvent.findMany({
    where: {
      ownerKey: LOCAL_OWNER_KEY,
      eventDate: {
        gte: startDate
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

  return Array.from({ length: activityWindowDays }, (_, index) => {
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

function getUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
