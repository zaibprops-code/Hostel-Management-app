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
export async function audit(input: AuditInput): Promise<void> {
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
