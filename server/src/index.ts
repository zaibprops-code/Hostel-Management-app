import { createApp } from "./app";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";
import { removeDemoDataIfPresent, resetDataIfRequested } from "./lib/cleanup";

async function main() {
  await prisma.$connect();
  // Optional one-time "start fresh" wipe, only when RESET_DATA is set (no-op otherwise).
  await resetDataIfRequested();
  // Clear the built-in demo data on the first real start-up (no-op afterwards).
  await removeDemoDataIfPresent();
  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`🏨 Hostel API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
