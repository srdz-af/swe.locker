import { LOCAL_OWNER_KEY } from "../domain/normalize.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../errors.js";
import { toApplicationDto } from "./mappers.js";

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
