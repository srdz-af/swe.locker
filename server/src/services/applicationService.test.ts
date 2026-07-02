import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.js";
import {
  archiveApplication,
  createApplicationFromPosting,
  createManualApplication,
  listApplicationActivity,
  listApplications,
  purgeArchivedApplications,
  restoreApplicationSnapshot,
  unarchiveApplication,
  updateApplicationDetails,
  updateApplicationStatus
} from "./applicationService.js";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  application: {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn()
  },
  applicationEvent: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn()
  },
  jobPosting: {
    findUnique: vi.fn()
  },
  resumeRun: {
    findFirst: vi.fn()
  }
}));

vi.mock("../db/prisma.js", () => ({
  prisma: prismaMock
}));

const baseApplication = {
  id: "application_1",
  ownerKey: "local",
  jobPostingId: "posting_1",
  company: "Acme",
  role: "Software Engineer Intern",
  jobPostingUrl: "https://jobs.example.com/acme",
  externalApplicationTrackingUrl: null,
  notes: null,
  interviewDates: "[]",
  interviewRound: null,
  links: "[]",
  submittedResumeRunId: null,
  status: "APPLIED",
  archivedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-02T00:00:00.000Z")
};

describe("applicationService", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists tracked applications for the local owner", async () => {
    prismaMock.application.findMany.mockResolvedValue([baseApplication]);

    await expect(listApplications()).resolves.toEqual([
      {
        id: "application_1",
        jobPostingId: "posting_1",
        company: "Acme",
        role: "Software Engineer Intern",
        jobPostingUrl: "https://jobs.example.com/acme",
        externalApplicationTrackingUrl: null,
        notes: null,
        interviewDates: [],
        interviewRound: null,
        links: [],
        submittedResumeRunId: null,
        status: "APPLIED",
        archivedAt: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        events: []
      }
    ]);
    expect(prismaMock.application.findMany).toHaveBeenCalledWith({
      where: { ownerKey: "local", archivedAt: null },
      orderBy: [{ updatedAt: "desc" }, { company: "asc" }, { role: "asc" }],
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });

  it("can include archived applications when listing for analytics", async () => {
    const archivedApplication = {
      ...baseApplication,
      id: "application_2",
      status: "DECLINED",
      archivedAt: new Date("2026-06-06T00:00:00.000Z")
    };
    prismaMock.application.findMany.mockResolvedValue([baseApplication, archivedApplication]);

    await expect(listApplications({ includeArchived: true })).resolves.toMatchObject([
      {
        id: "application_1",
        status: "APPLIED",
        archivedAt: null
      },
      {
        id: "application_2",
        status: "DECLINED",
        archivedAt: "2026-06-06T00:00:00.000Z"
      }
    ]);
    expect(prismaMock.application.findMany).toHaveBeenCalledWith({
      where: { ownerKey: "local" },
      orderBy: [{ updatedAt: "desc" }, { company: "asc" }, { role: "asc" }],
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });

  it("creates a manual application with a created event", async () => {
    prismaMock.application.create.mockResolvedValue({
      ...baseApplication,
      id: "manual_application_1",
      jobPostingId: null,
      company: "Manual Co",
      role: "Backend Intern",
      jobPostingUrl: "https://jobs.example.com/manual",
      externalApplicationTrackingUrl: "https://tracker.example.com/manual",
      status: "INTERVIEW",
      interviewRound: 1,
      events: [
        {
          id: "event_1",
          ownerKey: "local",
          applicationId: "manual_application_1",
          previousStatus: null,
          newStatus: "INTERVIEW",
          eventType: "CREATED",
          eventDate: new Date("2026-06-03T00:00:00.000Z"),
          createdAt: new Date("2026-06-03T00:00:00.000Z")
        }
      ]
    });

    await expect(
      createManualApplication({
        company: " Manual Co ",
        role: " Backend Intern ",
        jobPostingUrl: "https://jobs.example.com/manual",
        externalApplicationTrackingUrl: "https://tracker.example.com/manual",
        status: "INTERVIEW"
      })
    ).resolves.toMatchObject({
      id: "manual_application_1",
      jobPostingId: null,
      company: "Manual Co",
      role: "Backend Intern",
      status: "INTERVIEW",
      events: [
        {
          eventType: "CREATED",
          previousStatus: null,
          newStatus: "INTERVIEW"
        }
      ]
    });
    expect(prismaMock.application.create).toHaveBeenCalledWith({
      data: {
        ownerKey: "local",
        jobPostingId: null,
        company: "Manual Co",
        role: "Backend Intern",
        jobPostingUrl: "https://jobs.example.com/manual",
        externalApplicationTrackingUrl: "https://tracker.example.com/manual",
        status: "INTERVIEW",
        interviewRound: 1,
        events: {
          create: {
            ownerKey: "local",
            newStatus: "INTERVIEW",
            eventType: "CREATED"
          }
        }
      },
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });

  it("reopens archived declined posting applications as applied", async () => {
    const declinedApplication = {
      ...baseApplication,
      status: "DECLINED",
      archivedAt: new Date("2026-06-06T00:00:00.000Z")
    };
    const reopenedEvent = {
      id: "event_2",
      ownerKey: "local",
      applicationId: "application_1",
      previousStatus: "DECLINED",
      newStatus: "APPLIED",
      eventType: "STATUS_CHANGED",
      eventDate: new Date("2026-06-07T00:00:00.000Z"),
      createdAt: new Date("2026-06-07T00:00:00.000Z")
    };
    prismaMock.jobPosting.findUnique.mockResolvedValue({
      id: "posting_1",
      company: "Acme",
      role: "Software Engineer Intern"
    });
    prismaMock.application.findFirst.mockResolvedValue(declinedApplication);
    prismaMock.application.update.mockResolvedValue({
      ...baseApplication,
      status: "APPLIED",
      archivedAt: null
    });
    prismaMock.applicationEvent.create.mockResolvedValue(reopenedEvent);
    prismaMock.application.findUnique.mockResolvedValue({
      ...baseApplication,
      status: "APPLIED",
      archivedAt: null,
      events: [reopenedEvent]
    });

    await expect(createApplicationFromPosting({ jobPostingId: "posting_1" })).resolves.toMatchObject({
      id: "application_1",
      status: "APPLIED",
      archivedAt: null,
      events: [
        {
          eventType: "STATUS_CHANGED",
          previousStatus: "DECLINED",
          newStatus: "APPLIED"
        }
      ]
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        archivedAt: null,
        status: "APPLIED"
      }
    });
    expect(prismaMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        ownerKey: "local",
        applicationId: "application_1",
        previousStatus: "DECLINED",
        newStatus: "APPLIED",
        eventType: "STATUS_CHANGED"
      }
    });
  });

  it("rejects invalid manual application statuses", async () => {
    await expect(
      createManualApplication({
        company: "Manual Co",
        role: "Backend Intern",
        status: "CANCELED"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid application status."
    } satisfies Partial<HttpError>);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("rejects manual application offer outcome statuses", async () => {
    await expect(
      createManualApplication({
        company: "Manual Co",
        role: "Backend Intern",
        status: "HIRED"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Offer outcome statuses require an existing offer."
    } satisfies Partial<HttpError>);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("updates status and records an activity event", async () => {
    const updatedApplication = {
      ...baseApplication,
      status: "INTERVIEW",
      interviewRound: 1,
      updatedAt: new Date("2026-06-03T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);
    prismaMock.application.update.mockResolvedValue(updatedApplication);
    prismaMock.applicationEvent.create.mockResolvedValue({
      id: "event_1"
    });
    prismaMock.application.findUnique.mockResolvedValue({
      ...updatedApplication,
      events: [
        {
          id: "event_1",
          ownerKey: "local",
          applicationId: "application_1",
          previousStatus: "APPLIED",
          newStatus: "INTERVIEW",
          eventType: "STATUS_CHANGED",
          eventDate: new Date("2026-06-03T00:00:00.000Z"),
          createdAt: new Date("2026-06-03T00:00:00.000Z")
        }
      ]
    });

    await expect(updateApplicationStatus("application_1", "INTERVIEW")).resolves.toMatchObject({
      id: "application_1",
      status: "INTERVIEW",
      interviewRound: 1,
      updatedAt: "2026-06-03T00:00:00.000Z",
      events: [
        {
          eventType: "STATUS_CHANGED",
          previousStatus: "APPLIED",
          newStatus: "INTERVIEW"
        }
      ]
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: { status: "INTERVIEW", interviewRound: 1, archivedAt: null }
    });
    expect(prismaMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        ownerKey: "local",
        applicationId: "application_1",
        previousStatus: "APPLIED",
        newStatus: "INTERVIEW",
        eventType: "STATUS_CHANGED"
      }
    });
    expect(prismaMock.application.findUnique).toHaveBeenCalledWith({
      where: { id: "application_1" },
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });

  it("archives a tracked application when its status is declined", async () => {
    const declinedAt = new Date("2026-06-04T00:00:00.000Z");
    const offeredApplication = {
      ...baseApplication,
      status: "OFFER"
    };
    const declinedApplication = {
      ...baseApplication,
      status: "DECLINED",
      archivedAt: declinedAt,
      updatedAt: declinedAt
    };
    prismaMock.application.findFirst.mockResolvedValue(offeredApplication);
    prismaMock.application.update.mockResolvedValue(declinedApplication);
    prismaMock.applicationEvent.create.mockResolvedValue({
      id: "event_1"
    });
    prismaMock.application.findUnique.mockResolvedValue({
      ...declinedApplication,
      events: [
        {
          id: "event_1",
          ownerKey: "local",
          applicationId: "application_1",
          previousStatus: "OFFER",
          newStatus: "DECLINED",
          eventType: "STATUS_CHANGED",
          eventDate: declinedAt,
          createdAt: declinedAt
        }
      ]
    });

    await expect(updateApplicationStatus("application_1", "DECLINED")).resolves.toMatchObject({
      id: "application_1",
      status: "DECLINED",
      archivedAt: "2026-06-04T00:00:00.000Z",
      events: [
        {
          eventType: "STATUS_CHANGED",
          previousStatus: "OFFER",
          newStatus: "DECLINED"
        }
      ]
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        status: "DECLINED",
        archivedAt: expect.any(Date)
      }
    });
    expect(prismaMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        ownerKey: "local",
        applicationId: "application_1",
        previousStatus: "OFFER",
        newStatus: "DECLINED",
        eventType: "STATUS_CHANGED"
      }
    });
  });

  it("rejects declining an application before an offer", async () => {
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);

    await expect(updateApplicationStatus("application_1", "DECLINED")).rejects.toMatchObject({
      statusCode: 400,
      message: "Applications can only be declined from an offer."
    } satisfies Partial<HttpError>);
    expect(prismaMock.application.update).not.toHaveBeenCalled();
    expect(prismaMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it("moves a tracked application from offer to hired", async () => {
    const hiredAt = new Date("2026-06-04T00:00:00.000Z");
    const offeredApplication = {
      ...baseApplication,
      status: "OFFER"
    };
    const hiredApplication = {
      ...baseApplication,
      status: "HIRED",
      updatedAt: hiredAt
    };
    prismaMock.application.findFirst.mockResolvedValue(offeredApplication);
    prismaMock.application.update.mockResolvedValue(hiredApplication);
    prismaMock.applicationEvent.create.mockResolvedValue({
      id: "event_1"
    });
    prismaMock.application.findUnique.mockResolvedValue({
      ...hiredApplication,
      events: [
        {
          id: "event_1",
          ownerKey: "local",
          applicationId: "application_1",
          previousStatus: "OFFER",
          newStatus: "HIRED",
          eventType: "STATUS_CHANGED",
          eventDate: hiredAt,
          createdAt: hiredAt
        }
      ]
    });

    await expect(updateApplicationStatus("application_1", "HIRED")).resolves.toMatchObject({
      id: "application_1",
      status: "HIRED",
      archivedAt: null,
      events: [
        {
          eventType: "STATUS_CHANGED",
          previousStatus: "OFFER",
          newStatus: "HIRED"
        }
      ]
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        status: "HIRED",
        archivedAt: null
      }
    });
  });

  it("rejects hiring an application before an offer", async () => {
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);

    await expect(updateApplicationStatus("application_1", "HIRED")).rejects.toMatchObject({
      statusCode: 400,
      message: "Applications can only be hired from an offer."
    } satisfies Partial<HttpError>);
    expect(prismaMock.application.update).not.toHaveBeenCalled();
    expect(prismaMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it("archives a tracked application when its status is ghosted", async () => {
    const ghostedAt = new Date("2026-06-04T00:00:00.000Z");
    const ghostedApplication = {
      ...baseApplication,
      status: "GHOSTED",
      archivedAt: ghostedAt,
      updatedAt: ghostedAt
    };
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);
    prismaMock.application.update.mockResolvedValue(ghostedApplication);
    prismaMock.applicationEvent.create.mockResolvedValue({
      id: "event_1"
    });
    prismaMock.application.findUnique.mockResolvedValue({
      ...ghostedApplication,
      events: [
        {
          id: "event_1",
          ownerKey: "local",
          applicationId: "application_1",
          previousStatus: "APPLIED",
          newStatus: "GHOSTED",
          eventType: "STATUS_CHANGED",
          eventDate: ghostedAt,
          createdAt: ghostedAt
        }
      ]
    });

    await expect(updateApplicationStatus("application_1", "GHOSTED")).resolves.toMatchObject({
      id: "application_1",
      status: "GHOSTED",
      archivedAt: "2026-06-04T00:00:00.000Z"
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        status: "GHOSTED",
        archivedAt: expect.any(Date)
      }
    });
  });

  it("archives a tracked application when its status is withdrawn", async () => {
    const withdrawnAt = new Date("2026-06-04T00:00:00.000Z");
    const withdrawnApplication = {
      ...baseApplication,
      status: "WITHDRAWN",
      archivedAt: withdrawnAt,
      updatedAt: withdrawnAt
    };
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);
    prismaMock.application.update.mockResolvedValue(withdrawnApplication);
    prismaMock.applicationEvent.create.mockResolvedValue({
      id: "event_1"
    });
    prismaMock.application.findUnique.mockResolvedValue({
      ...withdrawnApplication,
      events: [
        {
          id: "event_1",
          ownerKey: "local",
          applicationId: "application_1",
          previousStatus: "APPLIED",
          newStatus: "WITHDRAWN",
          eventType: "STATUS_CHANGED",
          eventDate: withdrawnAt,
          createdAt: withdrawnAt
        }
      ]
    });

    await expect(updateApplicationStatus("application_1", "WITHDRAWN")).resolves.toMatchObject({
      id: "application_1",
      status: "WITHDRAWN",
      archivedAt: "2026-06-04T00:00:00.000Z"
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        status: "WITHDRAWN",
        archivedAt: expect.any(Date)
      }
    });
  });

  it("updates application details without creating a status event", async () => {
    const updatedApplication = {
      ...baseApplication,
      notes: "Recruiter screen scheduled.",
      interviewDates: JSON.stringify([{ label: "Recruiter screen", date: "2026-07-14T15:00:00.000Z" }]),
      interviewRound: 2,
      links: JSON.stringify([{ label: "Recruiter thread", url: "https://mail.example.com/thread" }]),
      updatedAt: new Date("2026-06-05T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);
    prismaMock.application.update.mockResolvedValue(updatedApplication);

    await expect(
      updateApplicationDetails("application_1", {
        notes: " Recruiter screen scheduled. ",
        interviewDates: [{ label: " Recruiter screen ", date: "2026-07-14T15:00:00.000Z" }],
        interviewRound: 2,
        links: [{ label: " Recruiter thread ", url: "https://mail.example.com/thread" }]
      })
    ).resolves.toMatchObject({
      id: "application_1",
      notes: "Recruiter screen scheduled.",
      interviewDates: [{ label: "Recruiter screen", date: "2026-07-14T15:00:00.000Z" }],
      interviewRound: 2,
      links: [{ label: "Recruiter thread", url: "https://mail.example.com/thread" }]
    });
    expect(prismaMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: "application_1",
        ownerKey: "local"
      }
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        notes: "Recruiter screen scheduled.",
        interviewDates: JSON.stringify([{ label: "Recruiter screen", date: "2026-07-14T15:00:00.000Z" }]),
        interviewRound: 2,
        links: JSON.stringify([{ label: "Recruiter thread", url: "https://mail.example.com/thread" }])
      },
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
    expect(prismaMock.applicationEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.resumeRun.findFirst).not.toHaveBeenCalled();
  });

  it("associates an application with a submitted resume run", async () => {
    const updatedApplication = {
      ...baseApplication,
      submittedResumeRunId: "resume_run_1",
      updatedAt: new Date("2026-06-05T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);
    prismaMock.resumeRun.findFirst.mockResolvedValue({ id: "resume_run_1" });
    prismaMock.application.update.mockResolvedValue(updatedApplication);

    await expect(
      updateApplicationDetails("application_1", {
        submittedResumeRunId: " resume_run_1 "
      })
    ).resolves.toMatchObject({
      id: "application_1",
      submittedResumeRunId: "resume_run_1"
    });
    expect(prismaMock.resumeRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: "resume_run_1",
        ownerKey: "local"
      },
      select: {
        id: true
      }
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        submittedResumeRunId: "resume_run_1"
      },
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });

  it("clears an associated submitted resume run", async () => {
    const applicationWithResume = {
      ...baseApplication,
      submittedResumeRunId: "resume_run_1"
    };
    const updatedApplication = {
      ...applicationWithResume,
      submittedResumeRunId: null,
      updatedAt: new Date("2026-06-05T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue(applicationWithResume);
    prismaMock.application.update.mockResolvedValue(updatedApplication);

    await expect(
      updateApplicationDetails("application_1", {
        submittedResumeRunId: null
      })
    ).resolves.toMatchObject({
      id: "application_1",
      submittedResumeRunId: null
    });
    expect(prismaMock.resumeRun.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        submittedResumeRunId: null
      },
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });

  it("rejects unknown submitted resume runs", async () => {
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);
    prismaMock.resumeRun.findFirst.mockResolvedValue(null);

    await expect(
      updateApplicationDetails("application_1", {
        submittedResumeRunId: "missing_resume_run"
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Resume run not found."
    } satisfies Partial<HttpError>);
    expect(prismaMock.application.update).not.toHaveBeenCalled();
  });

  it("archives a tracked application", async () => {
    const archivedApplication = {
      ...baseApplication,
      archivedAt: new Date("2026-06-04T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue(baseApplication);
    prismaMock.application.update.mockResolvedValue(archivedApplication);

    await expect(archiveApplication("application_1")).resolves.toMatchObject({
      id: "application_1",
      archivedAt: "2026-06-04T00:00:00.000Z"
    });
    expect(prismaMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: "application_1",
        ownerKey: "local",
        archivedAt: null
      }
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: { archivedAt: expect.any(Date) },
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });

  it("purges only archived applications", async () => {
    prismaMock.application.deleteMany.mockResolvedValue({ count: 3 });

    await expect(purgeArchivedApplications()).resolves.toEqual({
      deletedCount: 3
    });
    expect(prismaMock.application.deleteMany).toHaveBeenCalledWith({
      where: {
        ownerKey: "local",
        archivedAt: {
          not: null
        }
      }
    });
  });

  it("unarchives an active-status archived application without changing status", async () => {
    const archivedApplication = {
      ...baseApplication,
      status: "APPLIED",
      archivedAt: new Date("2026-06-04T00:00:00.000Z")
    };
    const unarchivedApplication = {
      ...archivedApplication,
      archivedAt: null,
      updatedAt: new Date("2026-06-05T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue(archivedApplication);
    prismaMock.application.update.mockResolvedValue(unarchivedApplication);
    prismaMock.application.findUnique.mockResolvedValue(unarchivedApplication);

    await expect(unarchiveApplication("application_1")).resolves.toMatchObject({
      id: "application_1",
      status: "APPLIED",
      archivedAt: null
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        archivedAt: null,
        status: "APPLIED"
      }
    });
    expect(prismaMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it("unarchives archived outcome applications as applied", async () => {
    const archivedApplication = {
      ...baseApplication,
      status: "WITHDRAWN",
      archivedAt: new Date("2026-06-04T00:00:00.000Z")
    };
    const unarchivedApplication = {
      ...archivedApplication,
      status: "APPLIED",
      archivedAt: null,
      updatedAt: new Date("2026-06-05T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue(archivedApplication);
    prismaMock.application.update.mockResolvedValue(unarchivedApplication);
    prismaMock.applicationEvent.create.mockResolvedValue({ id: "event_1" });
    prismaMock.application.findUnique.mockResolvedValue({
      ...unarchivedApplication,
      events: [
        {
          id: "event_1",
          ownerKey: "local",
          applicationId: "application_1",
          previousStatus: "WITHDRAWN",
          newStatus: "APPLIED",
          eventType: "STATUS_CHANGED",
          eventDate: new Date("2026-06-05T00:00:00.000Z"),
          createdAt: new Date("2026-06-05T00:00:00.000Z")
        }
      ]
    });

    await expect(unarchiveApplication("application_1")).resolves.toMatchObject({
      id: "application_1",
      status: "APPLIED",
      archivedAt: null,
      events: [
        {
          previousStatus: "WITHDRAWN",
          newStatus: "APPLIED"
        }
      ]
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: {
        archivedAt: null,
        status: "APPLIED"
      }
    });
    expect(prismaMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        ownerKey: "local",
        applicationId: "application_1",
        previousStatus: "WITHDRAWN",
        newStatus: "APPLIED",
        eventType: "STATUS_CHANGED"
      }
    });
  });

  it("restores an application snapshot", async () => {
    const restoredEvent = {
      id: "event_1",
      ownerKey: "local",
      applicationId: "application_1",
      previousStatus: null,
      newStatus: "APPLIED",
      eventType: "CREATED",
      eventDate: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z")
    };
    prismaMock.application.findFirst.mockResolvedValue({
      ...baseApplication,
      archivedAt: new Date("2026-06-04T00:00:00.000Z")
    });
    prismaMock.application.update.mockResolvedValue(baseApplication);
    prismaMock.applicationEvent.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.applicationEvent.create.mockResolvedValue(restoredEvent);
    prismaMock.application.findUnique.mockResolvedValue({
      ...baseApplication,
      events: [restoredEvent]
    });

    await expect(
      restoreApplicationSnapshot({
        id: "application_1",
        jobPostingId: "posting_1",
        company: "Acme",
        role: "Software Engineer Intern",
        jobPostingUrl: "https://jobs.example.com/acme",
        externalApplicationTrackingUrl: null,
        notes: null,
        interviewDates: [],
        interviewRound: null,
        links: [],
        submittedResumeRunId: null,
        status: "APPLIED",
        createdAt: "2026-06-01T00:00:00.000Z",
        events: [
          {
            id: "event_1",
            eventType: "CREATED",
            previousStatus: null,
            newStatus: "APPLIED",
            eventDate: "2026-06-01T00:00:00.000Z",
            createdAt: "2026-06-01T00:00:00.000Z"
          }
        ]
      })
    ).resolves.toMatchObject({
      id: "application_1",
      archivedAt: null,
      events: [
        {
          id: "event_1",
          eventType: "CREATED",
          newStatus: "APPLIED"
        }
      ]
    });
    expect(prismaMock.application.update).toHaveBeenCalledWith({
      where: { id: "application_1" },
      data: expect.objectContaining({
        archivedAt: null,
        company: "Acme",
        status: "APPLIED"
      })
    });
    expect(prismaMock.applicationEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        applicationId: "application_1",
        ownerKey: "local"
      }
    });
    expect(prismaMock.applicationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "event_1",
        applicationId: "application_1",
        eventType: "CREATED",
        newStatus: "APPLIED"
      })
    });
  });

  it("does not create a duplicate event when status is unchanged", async () => {
    prismaMock.application.findFirst.mockResolvedValue({
      ...baseApplication,
      status: "INTERVIEW"
    });

    await expect(updateApplicationStatus("application_1", "INTERVIEW")).resolves.toMatchObject({
      id: "application_1",
      status: "INTERVIEW"
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it("rejects invalid statuses before querying", async () => {
    await expect(updateApplicationStatus("application_1", "CANCELED")).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid application status."
    } satisfies Partial<HttpError>);
    expect(prismaMock.application.findFirst).not.toHaveBeenCalled();
  });

  it("rejects missing applications", async () => {
    prismaMock.application.findFirst.mockResolvedValue(null);

    await expect(updateApplicationStatus("missing", "REJECTED")).rejects.toMatchObject({
      statusCode: 404,
      message: "Tracked application not found."
    } satisfies Partial<HttpError>);
  });

  it("returns 365 days of unique application counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    prismaMock.application.findMany.mockResolvedValue([
      { createdAt: new Date("2026-06-26T05:00:00.000Z") },
      { createdAt: new Date("2026-06-26T23:00:00.000Z") },
      { createdAt: new Date("2026-06-27T01:00:00.000Z") }
    ]);

    const activity = await listApplicationActivity();

    expect(activity).toHaveLength(365);
    expect(activity[0]).toEqual({ date: "2025-06-28", count: 0 });
    expect(activity.at(-1)).toEqual({ date: "2026-06-27", count: 1 });
    expect(activity.find((day) => day.date === "2026-06-26")).toEqual({ date: "2026-06-26", count: 2 });
    expect(prismaMock.application.findMany).toHaveBeenCalledWith({
      where: {
        ownerKey: "local",
        createdAt: {
          gte: new Date("2025-06-28T00:00:00.000Z"),
          lt: new Date("2026-06-28T00:00:00.000Z")
        }
      },
      select: {
        createdAt: true
      }
    });
    expect(prismaMock.applicationEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns a full calendar year of unique application counts for a selected past year", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    prismaMock.application.findMany.mockResolvedValue([
      { createdAt: new Date("2025-01-01T05:00:00.000Z") },
      { createdAt: new Date("2025-12-31T23:00:00.000Z") }
    ]);

    const activity = await listApplicationActivity({ year: 2025 });

    expect(activity).toHaveLength(365);
    expect(activity[0]).toEqual({ date: "2025-01-01", count: 1 });
    expect(activity.at(-1)).toEqual({ date: "2025-12-31", count: 1 });
    expect(prismaMock.application.findMany).toHaveBeenCalledWith({
      where: {
        ownerKey: "local",
        createdAt: {
          gte: new Date("2025-01-01T00:00:00.000Z"),
          lt: new Date("2026-01-01T00:00:00.000Z")
        }
      },
      select: {
        createdAt: true
      }
    });
    expect(prismaMock.applicationEvent.findMany).not.toHaveBeenCalled();
  });
});
