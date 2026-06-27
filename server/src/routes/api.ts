import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { normalizeCompanyName } from "../domain/normalize.js";
import { HttpError } from "../errors.js";
import { createApplicationFromPosting, deleteApplication } from "../services/applicationService.js";
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
    const body = createApplicationBodySchema.parse(request.body);
    response.status(201).json(await createApplicationFromPosting(body));
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

const createApplicationBodySchema = z.object({
  jobPostingId: z.string().min(1),
  externalApplicationTrackingUrl: z.string().url().optional().nullable()
});

apiRouter.use((error: unknown, _request: Request, _response: Response, next: NextFunction) => {
  if (error instanceof z.ZodError) {
    next(new HttpError(400, "Invalid request payload."));
    return;
  }

  next(error);
});
