import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { normalizeCompanyName } from "../domain/normalize.js";
import { HttpError } from "../errors.js";
import { createApplicationFromPosting, deleteApplication } from "../services/applicationService.js";
import { followCompany, listFollowedCompanies, unfollowCompany } from "../services/followedCompanyService.js";
import { toFetchRunDto, toSourceConfigDto } from "../services/mappers.js";
import { getDashboardStats, listPostings } from "../services/postingService.js";
import { refreshSource } from "../services/refreshService.js";
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
    const query = postingsQuerySchema.parse(request.query);
    response.json(
      await listPostings({
        search: query.search,
        category: query.category,
        location: query.location,
        newOnly: query.newOnly,
        followedOnly: query.followedOnly,
        activeOnly: query.activeOnly
      })
    );
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/refresh", async (_request, response, next) => {
  try {
    response.status(202).json(await refreshSource());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/fetch-runs", async (_request, response, next) => {
  try {
    const fetchRuns = await prisma.fetchRun.findMany({
      orderBy: {
        startedAt: "desc"
      },
      take: 20
    });
    response.json(fetchRuns.map(toFetchRunDto));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/dashboard-stats", async (_request, response, next) => {
  try {
    response.json(await getDashboardStats());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/followed-companies", async (_request, response, next) => {
  try {
    response.json(await listFollowedCompanies());
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

const postingsQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  newOnly: z.coerce.boolean().optional(),
  followedOnly: z.coerce.boolean().optional(),
  activeOnly: z.coerce.boolean().optional()
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
