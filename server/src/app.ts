import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./errors.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: config.clientOrigin
    })
  );
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.status(200).json({
      ok: true,
      service: "swe.locker-api",
      timestamp: new Date().toISOString()
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
