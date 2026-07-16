import { createApp } from "./app";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.$connect();
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
