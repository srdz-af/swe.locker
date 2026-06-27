import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { normalizeExternalApplicationTrackingUrl } from "../domain/externalUrl.js";
import { normalizeCompanyName } from "../domain/normalize.js";
import { HttpError } from "../errors.js";
import {
  archiveApplication,
  createApplicationFromPosting,
  deleteApplication,
  listApplicationActivity,
  listApplications,
  updateApplicationStatus
} from "../services/applicationService.js";
import { followCompany, unfollowCompany } from "../services/followedCompanyService.js";
import { toSourceConfigDto } from "../services/mappers.js";
import { listPostings } from "../services/postingService.js";
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
    const body = createApplicationBodySchema.safeParse(request.body);
    if (!body.success) {
      const hasExternalLinkIssue = body.error.issues.some((issue) => issue.path.includes("externalApplicationTrackingUrl"));
      throw new HttpError(
        400,
        hasExternalLinkIssue ? "External tracking link must be a valid http(s) URL." : "Invalid request payload."
      );
    }

    response.status(201).json(await createApplicationFromPosting(body.data));
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

const followCompanyBodySchema = z.object({
  companyName: z.string().min(1)
});

const externalApplicationTrackingUrlSchema = z.preprocess((value) => {
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

const createApplicationBodySchema = z.object({
  jobPostingId: z.string().min(1),
  externalApplicationTrackingUrl: externalApplicationTrackingUrlSchema
});

const updateApplicationStatusBodySchema = z.object({
  status: z.enum(["APPLIED", "INTERVIEW", "OFFER", "HIRED", "REJECTED"])
});

const applicationActivityQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(9999).optional()
});

apiRouter.use((error: unknown, _request: Request, _response: Response, next: NextFunction) => {
  if (error instanceof z.ZodError) {
    next(new HttpError(400, "Invalid request payload."));
    return;
  }

  next(error);
});
