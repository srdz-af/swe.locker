# swe.locker

Track software engineering internship postings.

This repository starts as a single-package TypeScript full-stack app with React, Vite, IBM Carbon,
Express, Prisma, and SQLite.

## Requirements

- Node.js `22.12.0` or newer
- npm `9` or newer

This workspace uses `nvm` with Node `26.4.0` installed locally. If `node --version` reports Node 18,
open a fresh shell or run `nvm use node` before installing dependencies or running the app.

## Setup

```sh
cp .env.example .env
npm install
npm run prisma:validate
npm run prisma:migrate
npm run typecheck
```

## Development

```sh
npm run dev
```

This starts:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

The scaffolded health endpoint is:

```sh
curl http://localhost:4000/api/health
```

## Scripts

- `npm run dev`: run frontend and backend together
- `npm run dev:web`: run the Vite frontend
- `npm run dev:api`: run the Express API with watch mode
- `npm run build`: build shared types, backend, and frontend
- `npm run start`: run the built backend
- `npm run typecheck`: typecheck shared, backend, and frontend code
- `npm run prisma:generate`: generate Prisma client artifacts
- `npm run prisma:validate`: validate the Prisma schema
- `npm run prisma:migrate`: create the local SQLite file if needed, then run Prisma Migrate
- `npm run prisma:migrate:deploy`: create the local SQLite file if needed, then apply checked-in migrations
- `npm run prisma:studio`: open Prisma Studio

## Environment

Copy `.env.example` to `.env` and adjust values as needed.

Set `VITE_MAPBOX_ACCESS_TOKEN` to render the Carbon-themed spatial map in posting details.

The source defaults point at the current SimplifyJobs Summer 2026 internships README on the `dev`
branch. The backend refreshes the local snapshot on startup when empty and then on the configured
interval.

## Current Scope

This app intentionally does not include authentication or mock data as a source of truth.
