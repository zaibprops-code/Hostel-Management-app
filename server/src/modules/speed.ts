import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/http";
import { requirePermission } from "../middleware/rbac";
import { env } from "../lib/env";

// Where the API runs vs where the database is, and how long one database round
// trip takes. Every save or page load makes several trips, so a server far
// from its database (e.g. Vercel's default Washington, D.C. region with a
// Mumbai database) feels slow no matter how efficient the code is.
const router = Router();

// Supabase regions → friendly name and the matching Vercel function region.
const REGIONS: Record<string, { name: string; vercel: string }> = {
  "ap-south-1": { name: "Mumbai", vercel: "bom1" },
  "ap-southeast-1": { name: "Singapore", vercel: "sin1" },
  "ap-southeast-2": { name: "Sydney", vercel: "syd1" },
  "ap-northeast-1": { name: "Tokyo", vercel: "hnd1" },
  "ap-northeast-2": { name: "Seoul", vercel: "icn1" },
  "eu-central-1": { name: "Frankfurt", vercel: "fra1" },
  "eu-central-2": { name: "Zurich", vercel: "fra1" },
  "eu-west-1": { name: "Ireland", vercel: "dub1" },
  "eu-west-2": { name: "London", vercel: "lhr1" },
  "eu-west-3": { name: "Paris", vercel: "cdg1" },
  "eu-north-1": { name: "Stockholm", vercel: "arn1" },
  "us-east-1": { name: "N. Virginia", vercel: "iad1" },
  "us-east-2": { name: "Ohio", vercel: "cle1" },
  "us-west-1": { name: "N. California", vercel: "sfo1" },
  "us-west-2": { name: "Oregon", vercel: "pdx1" },
  "ca-central-1": { name: "Canada", vercel: "yul1" },
  "sa-east-1": { name: "São Paulo", vercel: "gru1" },
};
const VERCEL: Record<string, string> = {
  bom1: "Mumbai", sin1: "Singapore", syd1: "Sydney", hnd1: "Tokyo", icn1: "Seoul", kix1: "Osaka", hkg1: "Hong Kong",
  fra1: "Frankfurt", dub1: "Dublin", lhr1: "London", cdg1: "Paris", arn1: "Stockholm",
  iad1: "Washington, D.C.", cle1: "Cleveland", sfo1: "San Francisco", pdx1: "Portland", yul1: "Montréal", gru1: "São Paulo", cpt1: "Cape Town", dxb1: "Dubai",
};

// Only the region code is read from the database host — never credentials.
function dbRegion(): string | null {
  try {
    const host = new URL(env.databaseUrl).hostname;
    const m = /([a-z]{2}-[a-z]+-\d)\.pooler\.supabase\.com$/.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// GET /api/speed — owner-level diagnostics shown in Settings.
router.get(
  "/",
  requirePermission("hostels.manage"),
  asyncHandler(async (_req, res) => {
    const trips: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = process.hrtime.bigint();
      await prisma.$queryRaw`SELECT 1`;
      trips.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    const server = process.env.VERCEL_REGION ?? null;
    const db = dbRegion();
    const recommended = db ? REGIONS[db]?.vercel ?? null : null;
    res.json({
      dbRoundTripMs: Math.round(Math.min(...trips)),
      server: server ? { code: server, name: VERCEL[server] ?? server } : null,
      database: db ? { code: db, name: REGIONS[db]?.name ?? db } : null,
      recommendedServerRegion: recommended ? { code: recommended, name: VERCEL[recommended] ?? recommended } : null,
      mismatch: !!(server && recommended && server !== recommended),
    });
  })
);

export default router;
