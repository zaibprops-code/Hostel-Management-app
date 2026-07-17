// Vercel serverless entry point for the backend API.
//
// Vercel routes every incoming `/api/*` request to this catch-all function.
// It reuses the exact same Express application the standalone server uses
// (see `server/src/app.ts`), so all routes — `/api/health`, `/api/auth/...`,
// etc. — are matched against the full request path just like in local/prod
// server mode. Exporting the Express app as the default export lets Vercel's
// Node runtime invoke it directly as the request handler.
import { createApp } from "../server/src/app";

const app = createApp();

export default app;
