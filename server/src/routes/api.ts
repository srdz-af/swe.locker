import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { normalizeExternalApplicationTrackingUrl } from "../domain/externalUrl.js";
import { normalizeCompanyName } from "../domain/normalize.js";
import { HttpError } from "../errors.js";
import {
  archiveApplication,
  createApplicationFromPosting,
  createManualApplication,
  deleteApplication,
  listApplicationActivity,
  listApplications,
  updateApplicationDetails,
  updateApplicationStatus
} from "../services/applicationService.js";
import { followCompany, unfollowCompany } from "../services/followedCompanyService.js";
import { toSourceConfigDto } from "../services/mappers.js";
import { searchOfficeImages } from "../services/officeImageService.js";
import { listPostings } from "../services/postingService.js";
import { createResumeRun, deleteResumeRun, listResumeRuns } from "../services/resumeRunService.js";
import { ensureSourceConfig } from "../services/sourceConfigService.js";

export const apiRouter = Router();

apiRouter.get("/source-config", async (_request, response, next) => {
  try {
    response.json(toSourceConfigDto(await ensureSourceConfig()));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/postings", async (request, response, next) => {
  try {
    if (Object.keys(request.query).length > 0) {
      throw new HttpError(400, "Posting filters are client-side only.");
    }

    response.json(await listPostings());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/office-images", async (request, response, next) => {
  try {
    const query = officeImagesQuerySchema.parse(request.query);
    response.json(await searchOfficeImages(query));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/followed-companies", async (request, response, next) => {
  try {
    const body = followCompanyBodySchema.parse(request.body);
    response.status(201).json(await followCompany(body.companyName));
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/followed-companies/:normalizedCompanyName", async (request, response, next) => {
  try {
    await unfollowCompany(normalizeCompanyName(request.params.normalizedCompanyName));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/applications", async (request, response, next) => {
  try {
    const postingBody = createApplicationFromPostingBodySchema.safeParse(request.body);
    if (postingBody.success) {
      response.status(201).json(await createApplicationFromPosting(postingBody.data));
      return;
    }

    const manualBody = createManualApplicationBodySchema.safeParse(request.body);
    if (!manualBody.success) {
      const issues = [...postingBody.error.issues, ...manualBody.error.issues];
      const hasUrlIssue = issues.some(
        (issue) => issue.path.includes("externalApplicationTrackingUrl") || issue.path.includes("jobPostingUrl")
      );
      throw new HttpError(
        400,
        hasUrlIssue ? "Application links must be valid http(s) URLs." : "Invalid request payload."
      );
    }

    response.status(201).json(await createManualApplication(manualBody.data));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/applications", async (_request, response, next) => {
  try {
    response.json(await listApplications());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/applications/activity", async (request, response, next) => {
  try {
    const query = applicationActivityQuerySchema.parse(request.query);
    response.json(await listApplicationActivity(query));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/applications/:applicationId/status", async (request, response, next) => {
  try {
    const body = updateApplicationStatusBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new HttpError(400, "Invalid application status.");
    }
    response.json(await updateApplicationStatus(request.params.applicationId, body.data.status));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/applications/:applicationId/details", async (request, response, next) => {
  try {
    const body = updateApplicationDetailsBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new HttpError(400, "Invalid application details payload.");
    }
    response.json(await updateApplicationDetails(request.params.applicationId, body.data));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/applications/:applicationId/archive", async (request, response, next) => {
  try {
    response.json(await archiveApplication(request.params.applicationId));
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/applications/:applicationId", async (request, response, next) => {
  try {
    await deleteApplication(request.params.applicationId);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/resume-runs", async (_request, response, next) => {
  try {
    response.json(await listResumeRuns());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/resume-runs", async (request, response, next) => {
  try {
    const body = createResumeRunBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new HttpError(400, "Invalid resume run payload.");
    }

    response.status(201).json(await createResumeRun(body.data));
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/resume-runs/:resumeRunId", async (request, response, next) => {
  try {
    await deleteResumeRun(request.params.resumeRunId);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

const followCompanyBodySchema = z.object({
  companyName: z.string().min(1)
});

const officeImagesQuerySchema = z.object({
  company: z.string().trim().min(1),
  location: z.string().trim().min(1).optional()
});

const optionalHttpUrlSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return normalizeExternalApplicationTrackingUrl(value);
  } catch {
    return value.trim();
  }
}, z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://")).optional().nullable());

const requiredHttpUrlSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return normalizeExternalApplicationTrackingUrl(value);
  } catch {
    return value.trim();
  }
}, z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://")));

const createApplicationFromPostingBodySchema = z.object({
  jobPostingId: z.string().min(1),
  externalApplicationTrackingUrl: optionalHttpUrlSchema
});

const createManualApplicationBodySchema = z.object({
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  jobPostingUrl: optionalHttpUrlSchema,
  externalApplicationTrackingUrl: optionalHttpUrlSchema,
  status: z.enum(["APPLIED", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]).optional()
});

const updateApplicationStatusBodySchema = z.object({
  status: z.enum(["APPLIED", "INTERVIEW", "OFFER", "HIRED", "REJECTED"])
});

const applicationLinkSchema = z.object({
  label: z.string().trim().optional().nullable(),
  url: requiredHttpUrlSchema
});

const applicationInterviewDateSchema = z.object({
  label: z.string().trim().optional().nullable(),
  date: z.string().datetime({ offset: true })
});

const updateApplicationDetailsBodySchema = z.object({
  notes: z.string().optional().nullable(),
  interviewDates: z.array(applicationInterviewDateSchema).optional(),
  links: z.array(applicationLinkSchema).optional()
});

const applicationActivityQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(9999).optional()
});

const resumeMetricSchema = z.object({
  label: z.string().trim().min(1),
  value: z.number().int().min(0).max(100)
});

const createResumeRunBodySchema = z.object({
  id: z.string().trim().min(1).optional(),
  sourceName: z.string().trim().min(1),
  parsedText: z.string().trim().min(1),
  grade: z.number().int().min(0).max(100).optional().nullable(),
  tier: z.enum(["S", "A", "B", "C"]).optional().nullable(),
  verdict: z.string().trim().optional().nullable(),
  metrics: z.array(resumeMetricSchema).optional(),
  createdAt: z.string().datetime({ offset: true }).optional()
});

apiRouter.use((error: unknown, _request: Request, _response: Response, next: NextFunction) => {
  if (error instanceof z.ZodError) {
    next(new HttpError(400, "Invalid request payload."));
    return;
  }

  next(error);
});
