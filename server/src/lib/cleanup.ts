import { prisma } from "./prisma";
import { env } from "./env";

// Deletes every business record in a foreign-key-safe order. Leaves the
// AppSetting store intact (it holds cross-reset bookkeeping). After this runs
// the database has zero users, so the app returns to first-run setup.
async function wipeAllData(): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.paymentAllocation.deleteMany(),
    prisma.depositTransaction.deleteMany(),
    prisma.securityDeposit.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.rentCharge.deleteMany(),
    prisma.checkout.deleteMany(),
    prisma.admission.deleteMany(),
    prisma.residentDocument.deleteMany(),
    prisma.foodAttendance.deleteMany(),
    prisma.inventoryTransaction.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.salaryPayment.deleteMany(),
    prisma.staffAttendance.deleteMany(),
    prisma.visitor.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.maintenanceTicket.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.income.deleteMany(),
    prisma.investment.deleteMany(),
    prisma.loan.deleteMany(),
    prisma.notice.deleteMany(),
    prisma.menu.deleteMany(),
  ]);
  await prisma.resident.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.bed.deleteMany();
  await prisma.room.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.userHostelAccess.deleteMany();
  await prisma.user.deleteMany();
  await prisma.foodPlan.deleteMany();
  await prisma.hostel.deleteMany();
  await prisma.company.deleteMany();
}

// One-time "start over from scratch" reset, triggered by the RESET_DATA env var.
//
// Safety: the exact token value is recorded in AppSetting after it runs, and the
// wipe is skipped if that same token has already been consumed. So an owner can
// set RESET_DATA once to clear everything, and even if they forget to remove it,
// a later redeploy will NOT wipe the fresh data they entered afterwards — only a
// NEW (different) token value would trigger another reset.
export async function resetDataIfRequested(): Promise<void> {
  const token = env.resetDataToken.trim();
  if (!token) return;

  const CONSUMED_KEY = "resetDataConsumedToken";
  const consumed = await prisma.appSetting.findUnique({ where: { key: CONSUMED_KEY } });
  if (consumed?.value === token) {
    // eslint-disable-next-line no-console
    console.log("↩️  RESET_DATA is set but this token was already used — skipping (no wipe).");
    return;
  }

  // eslint-disable-next-line no-console
  console.log("⚠️  RESET_DATA set — erasing ALL data and returning app to first-run setup...");
  await wipeAllData();
  await prisma.appSetting.upsert({
    where: { key: CONSUMED_KEY },
    create: { key: CONSUMED_KEY, value: token },
    update: { value: token },
  });
  // eslint-disable-next-line no-console
  console.log("✅ Data reset complete. Open the app to set up your business again. You can now remove RESET_DATA.");
}

// Removes the built-in demo/sample dataset if it is present.
//
// It only runs when the demo owner account (owner@xyzhostel.com) exists, which
// is unique to the seeded sample data — so it clears the demo once and then
// becomes a permanent no-op. It never touches a real business's data, because a
// real owner signs up with their own email, not this fixed demo address.
export async function removeDemoDataIfPresent(): Promise<void> {
  const demoOwner = await prisma.user.findUnique({
    where: { email: "owner@xyzhostel.com" },
    select: { id: true },
  });
  if (!demoOwner) return;

  // eslint-disable-next-line no-console
  console.log("🧹 Removing built-in demo data (first real start-up)...");

  await wipeAllData();

  // eslint-disable-next-line no-console
  console.log("✅ Demo data removed. The app is now empty and ready for real setup.");
}
