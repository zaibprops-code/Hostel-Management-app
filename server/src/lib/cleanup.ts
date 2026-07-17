import { prisma } from "./prisma";

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

  // Delete in FK-safe order.
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

  // eslint-disable-next-line no-console
  console.log("✅ Demo data removed. The app is now empty and ready for real setup.");
}
