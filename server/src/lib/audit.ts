import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  hostelId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

// Records an audit log entry. Never throws — auditing should not break the
// primary operation.
//
// Speed: the log write is one more database round trip on every save. Where
// the platform guarantees it still completes after the reply is sent, it no
// longer holds the reply up:
//   • on Vercel, via the request context's waitUntil (when available);
//   • on a long-running server (local / Render), the process simply finishes it.
// On a serverless platform without waitUntil it is awaited as before. Pass
// { durable: true } when the page reads the entry straight back (room history).
function vercelWaitUntil(): ((p: Promise<unknown>) => void) | null {
  const ctx = (globalThis as any)[Symbol.for("@vercel/request-context")]?.get?.();
  return typeof ctx?.waitUntil === "function" ? (p) => ctx.waitUntil(p) : null;
}
const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export async function audit(input: AuditInput, opts: { durable?: boolean } = {}): Promise<void> {
  const write = writeAudit(input);
  if (opts.durable) return write;
  if (!serverless) return; // long-running process: completes in the background
  const waitUntil = vercelWaitUntil();
  if (waitUntil) return void waitUntil(write);
  return write;
}

async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        hostelId: input.hostelId ?? null,
        oldValue: (input.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to write audit log:", err);
  }
}
