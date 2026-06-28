import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.js";
import {
  archiveApplication,
  createManualApplication,
  listApplicationActivity,
  listApplications,
  updateApplicationStatus
} from "./applicationService.js";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  application: {
    create: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn()
  },
  applicationEvent: {
    create: vi.fn(),
    findMany: vi.fn()
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

  it("rejects invalid manual application statuses", async () => {
    await expect(
      createManualApplication({
        company: "Manual Co",
        role: "Backend Intern",
        status: "GHOSTED"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid application status."
    } satisfies Partial<HttpError>);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("updates status and records an activity event", async () => {
    const updatedApplication = {
      ...baseApplication,
      status: "INTERVIEW",
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
      data: { status: "INTERVIEW" }
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
    await expect(updateApplicationStatus("application_1", "GHOSTED")).rejects.toMatchObject({
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

  it("returns 365 days of activity counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    prismaMock.applicationEvent.findMany.mockResolvedValue([
      { eventDate: new Date("2026-06-26T05:00:00.000Z") },
      { eventDate: new Date("2026-06-26T23:00:00.000Z") },
      { eventDate: new Date("2026-06-27T01:00:00.000Z") }
    ]);

    const activity = await listApplicationActivity();

    expect(activity).toHaveLength(365);
    expect(activity[0]).toEqual({ date: "2025-06-28", count: 0 });
    expect(activity.at(-1)).toEqual({ date: "2026-06-27", count: 1 });
    expect(activity.find((day) => day.date === "2026-06-26")).toEqual({ date: "2026-06-26", count: 2 });
    expect(prismaMock.applicationEvent.findMany).toHaveBeenCalledWith({
      where: {
        ownerKey: "local",
        eventDate: {
          gte: new Date("2025-06-28T00:00:00.000Z"),
          lt: new Date("2026-06-28T00:00:00.000Z")
        }
      },
      select: {
        eventDate: true
      }
    });
  });

  it("returns a full calendar year of activity counts for a selected past year", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    prismaMock.applicationEvent.findMany.mockResolvedValue([
      { eventDate: new Date("2025-01-01T05:00:00.000Z") },
      { eventDate: new Date("2025-12-31T23:00:00.000Z") }
    ]);

    const activity = await listApplicationActivity({ year: 2025 });

    expect(activity).toHaveLength(365);
    expect(activity[0]).toEqual({ date: "2025-01-01", count: 1 });
    expect(activity.at(-1)).toEqual({ date: "2025-12-31", count: 1 });
    expect(prismaMock.applicationEvent.findMany).toHaveBeenCalledWith({
      where: {
        ownerKey: "local",
        eventDate: {
          gte: new Date("2025-01-01T00:00:00.000Z"),
          lt: new Date("2026-01-01T00:00:00.000Z")
        }
      },
      select: {
        eventDate: true
      }
    });
  });
});
