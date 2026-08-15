// Vercel serverless entry point for the Express API.
//
// Vercel treats every file under /api as a serverless function. This wraps the
// exact same Express app used for local development and the Render deployment
// (server/src/app.ts) and exports it as the function handler — an Express app is
// itself a `(req, res)` handler, so Vercel can invoke it directly.
//
// IMPORTANT: unlike server/src/index.ts, this entry deliberately does NOT run
// any start-up maintenance (removeDemoDataIfPresent / resetDataIfRequested).
// Those routines can DELETE data, and a serverless function cold-starts on every
// scaled/idle invocation — running them here could wipe the production database.
// Schema and data changes must only ever be applied deliberately, from a trusted
// machine, never as a side effect of a deploy or a cold start. Prisma connects
// lazily on the first query, so no explicit $connect is needed here.
import { createApp } from "../server/src/app";

export default createApp();
