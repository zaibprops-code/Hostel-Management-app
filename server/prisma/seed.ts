import { PrismaClient, Role, BedStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
  // Safety guard: never wipe an existing (e.g. production) database on redeploy.
  // The seed only runs on an empty database. Use FORCE_SEED=1 to override in dev.
  if (!process.env.FORCE_SEED && (await prisma.company.count()) > 0) {
    console.log("ℹ️  Database already has data — skipping seed. Set FORCE_SEED=1 to reseed.");
    return;
  }

  console.log("🌱 Seeding database...");

  // Clean slate (dev only)
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

  // Company
  const company = await prisma.company.create({ data: { name: "XYZ Hostel Group", currency: "PKR" } });

  // Food plans
  const fullPlan = await prisma.foodPlan.create({ data: { name: "Full Meal Plan", monthlyCost: 12000, description: "Breakfast, lunch & dinner" } });
  const twoPlan = await prisma.foodPlan.create({ data: { name: "Lunch + Dinner", monthlyCost: 9000, includesBreakfast: false } });

  // Hostels
  // Property rents are set below the potential bed-rent income so each branch
  // runs at a healthy operating margin (realistic for a viable hostel business).
  const hostelsData = [
    { name: "XYZ Boys Hostel Islamabad", code: "ISB-B", city: "Islamabad", gender: "MALE" as const, propertyRent: 140000, propertyDeposit: 280000, contactNumber: "051-1234567", address: "G-11 Markaz, Islamabad" },
    { name: "XYZ Boys Hostel Rawalpindi", code: "RWP-B", city: "Rawalpindi", gender: "MALE" as const, propertyRent: 150000, propertyDeposit: 300000, contactNumber: "051-7654321", address: "Satellite Town, Rawalpindi" },
    { name: "XYZ Girls Hostel Islamabad", code: "ISB-G", city: "Islamabad", gender: "FEMALE" as const, propertyRent: 160000, propertyDeposit: 320000, contactNumber: "051-2223334", address: "F-10 Markaz, Islamabad" },
  ];

  const hostels = [];
  for (const h of hostelsData) {
    hostels.push(await prisma.hostel.create({ data: { ...h, companyId: company.id } }));
  }

  // Users
  const pw = await bcrypt.hash("Password123", 10);
  const owner = await prisma.user.create({ data: { companyId: company.id, name: "Ahmed Raza (Owner)", email: "owner@xyzhostel.com", phone: "0300-1112222", passwordHash: pw, role: Role.OWNER } });

  const manager1 = await prisma.user.create({ data: { companyId: company.id, name: "Bilal Khan (Manager ISB)", email: "manager@xyzhostel.com", passwordHash: pw, role: Role.MANAGER, hostelAccess: { create: [{ hostelId: hostels[0].id }] } } });
  await prisma.user.create({ data: { companyId: company.id, name: "Sana Malik (Manager RWP)", email: "manager2@xyzhostel.com", passwordHash: pw, role: Role.MANAGER, hostelAccess: { create: [{ hostelId: hostels[1].id }] } } });
  await prisma.user.create({ data: { companyId: company.id, name: "Fatima Noor (Accountant)", email: "accountant@xyzhostel.com", passwordHash: pw, role: Role.ACCOUNTANT, hostelAccess: { create: hostels.map((h) => ({ hostelId: h.id })) } } });
  await prisma.user.create({ data: { companyId: company.id, name: "Imran Ali (Kitchen)", email: "kitchen@xyzhostel.com", passwordHash: pw, role: Role.KITCHEN, hostelAccess: { create: [{ hostelId: hostels[0].id }] } } });

  console.log("👤 Users created (all password: Password123)");

  const firstNamesM = ["Hamza", "Usman", "Ali", "Zain", "Saad", "Hassan", "Fahad", "Talha", "Umar", "Bilal", "Danish", "Rehan", "Kashif", "Nabeel", "Adeel"];
  const firstNamesF = ["Ayesha", "Maryam", "Hira", "Zoya", "Iqra", "Nimra", "Areeba", "Sana", "Laiba", "Mahnoor", "Fatima", "Amna", "Rida", "Anum", "Sadia"];
  const lastNames = ["Khan", "Ahmed", "Malik", "Butt", "Sheikh", "Raza", "Iqbal", "Hussain", "Chaudhry", "Awan"];
  const unis = ["NUST", "COMSATS", "FAST", "Air University", "Bahria University", "Quaid-e-Azam University", "PIEAS"];

  let residentCount = 0;

  for (const hostel of hostels) {
    const isFemale = hostel.gender === "FEMALE";
    const floorCount = 2;
    for (let f = 1; f <= floorCount; f++) {
      const floor = await prisma.floor.create({ data: { hostelId: hostel.id, name: `${f === 1 ? "First" : "Second"} Floor`, level: f } });
      const roomsPerFloor = 4;
      for (let r = 1; r <= roomsPerFloor; r++) {
        const capacity = randInt(2, 4);
        const room = await prisma.room.create({ data: { hostelId: hostel.id, floorId: floor.id, name: `Room ${f}0${r}`, capacity } });
        for (let b = 0; b < capacity; b++) {
          const label = String.fromCharCode(65 + b); // A, B, C...
          const monthlyRent = randInt(14, 22) * 1000;
          const bed = await prisma.bed.create({ data: { hostelId: hostel.id, roomId: room.id, label: `Bed ${label}`, monthlyRent } });

          // ~70% of beds occupied
          if (Math.random() < 0.7) {
            const name = `${isFemale ? rand(firstNamesF) : rand(firstNamesM)} ${rand(lastNames)}`;
            const admissionMonthsAgo = randInt(1, 6);
            const admissionDate = new Date();
            admissionDate.setMonth(admissionDate.getMonth() - admissionMonthsAgo);
            admissionDate.setDate(randInt(1, 12));

            const deposit = monthlyRent;
            const resident = await prisma.resident.create({
              data: {
                hostelId: hostel.id, bedId: bed.id, fullName: name,
                guardianName: `${rand(lastNames)} (Father)`,
                gender: isFemale ? "FEMALE" : "MALE",
                cnic: `61101-${randInt(1000000, 9999999)}-${randInt(1, 9)}`,
                phone: `03${randInt(10, 49)}-${randInt(1000000, 9999999)}`,
                city: hostel.city, university: rand(unis), program: rand(["BS CS", "BS EE", "BBA", "BS SE", "MBA"]),
                admissionDate, checkInDate: admissionDate, monthlyRent, contractMonths: 12,
                foodPlanId: Math.random() < 0.6 ? (Math.random() < 0.5 ? fullPlan.id : twoPlan.id) : null,
                status: "ACTIVE",
              },
            });
            await prisma.bed.update({ where: { id: bed.id }, data: { status: BedStatus.OCCUPIED } });
            await prisma.admission.create({ data: { hostelId: hostel.id, residentId: resident.id, bedId: bed.id, admissionDate, monthlyRent, depositAmount: deposit, rentDueDay: 1, contractMonths: 12 } });

            // Deposit
            const sd = await prisma.securityDeposit.create({ data: { hostelId: hostel.id, residentId: resident.id, amount: deposit, status: "HELD" } });
            await prisma.depositTransaction.create({ data: { depositId: sd.id, type: "DEPOSIT", amount: deposit, reason: "Initial security deposit" } });

            // Generate rent charges from admission to now; pay most of them
            const cursor = new Date(admissionDate.getFullYear(), admissionDate.getMonth(), 1);
            const now = new Date();
            while (cursor.getFullYear() < now.getFullYear() || (cursor.getFullYear() === now.getFullYear() && cursor.getMonth() <= now.getMonth())) {
              const dueDate = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
              const isCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
              // Older months fully paid; current month sometimes unpaid/partial
              let amountPaid = monthlyRent;
              let status: any = "PAID";
              if (isCurrentMonth && Math.random() < 0.4) {
                if (Math.random() < 0.5) { amountPaid = 0; status = dueDate < now ? "OVERDUE" : "PENDING"; }
                else { amountPaid = Math.round(monthlyRent / 2); status = "PARTIALLY_PAID"; }
              }
              const charge = await prisma.rentCharge.create({ data: { hostelId: hostel.id, residentId: resident.id, periodYear: cursor.getFullYear(), periodMonth: cursor.getMonth() + 1, dueDate, amount: monthlyRent, amountPaid, status } });
              if (amountPaid > 0) {
                const payment = await prisma.payment.create({ data: { hostelId: hostel.id, residentId: resident.id, amount: amountPaid, method: rand(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA"]) as any, paidAt: dueDate, receivedById: manager1.id, notes: "Monthly rent" } });
                await prisma.paymentAllocation.create({ data: { paymentId: payment.id, rentChargeId: charge.id, amount: amountPaid } });
              }
              cursor.setMonth(cursor.getMonth() + 1);
            }
            residentCount++;
          } else if (Math.random() < 0.15) {
            await prisma.bed.update({ where: { id: bed.id }, data: { status: BedStatus.MAINTENANCE } });
          }
        }
      }
    }

    // Expenses (last 6 months)
    const expenseCats = ["ELECTRICITY", "GAS", "WATER", "INTERNET", "GROCERIES", "CLEANING", "MAINTENANCE", "SECURITY"] as const;
    for (let m = 0; m < 6; m++) {
      const date = new Date(); date.setMonth(date.getMonth() - m); date.setDate(5);
      // property rent (recurring)
      await prisma.expense.create({ data: { hostelId: hostel.id, category: "PROPERTY_RENT", amount: Number(hostel.propertyRent), date, vendor: "Building Owner", isRecurring: true, recurringDay: 5, description: "Monthly building rent", addedById: owner.id } });
      for (const cat of expenseCats) {
        await prisma.expense.create({ data: { hostelId: hostel.id, category: cat, amount: randInt(3, 20) * 1000, date: new Date(date.getFullYear(), date.getMonth(), randInt(3, 25)), vendor: rand(["K-Electric", "SNGPL", "PTCL", "Metro Cash", "Local Supplier"]), addedById: owner.id } });
      }
    }

    // Other income
    for (let i = 0; i < 5; i++) {
      const date = new Date(); date.setDate(date.getDate() - randInt(1, 60));
      await prisma.income.create({ data: { hostelId: hostel.id, category: rand(["LAUNDRY", "LATE_FEE", "EXTRA_FOOD", "OTHER"]) as any, amount: randInt(1, 8) * 1000, date, addedById: owner.id } });
    }

    // Staff
    const staffTypes = [["Kitchen Cook", "KITCHEN", 35000], ["Cleaner", "CLEANER", 28000], ["Security Guard", "SECURITY", 32000]] as const;
    for (const [name, type, salary] of staffTypes) {
      await prisma.staff.create({ data: { hostelId: hostel.id, name: `${name} - ${rand(lastNames)}`, type: type as any, monthlySalary: salary as number, joiningDate: new Date(2024, 0, 1), phone: `03${randInt(10, 49)}-${randInt(1000000, 9999999)}` } });
    }

    // Inventory
    const items = [["Rice", "Grains", "kg", 80], ["Flour", "Grains", "kg", 120], ["Cooking Oil", "Oil", "litre", 15], ["Chicken", "Meat", "kg", 5], ["Vegetables", "Vegetables", "kg", 25], ["Eggs", "Dairy", "dozen", 8], ["Milk", "Dairy", "litre", 20], ["Tea", "Beverages", "kg", 3]] as const;
    for (const [name, cat, unit, qty] of items) {
      await prisma.inventoryItem.create({ data: { hostelId: hostel.id, name: name as string, category: cat as string, unit: unit as string, quantity: qty as number, minStock: Math.round((qty as number) * 0.3), purchasePrice: randInt(2, 8) * 100 } });
    }

    // Suppliers
    await prisma.supplier.create({ data: { hostelId: hostel.id, name: "Metro Cash & Carry", contactPerson: "Sales Desk", phone: "051-111222333", products: "Groceries, staples" } });

    // Maintenance & complaints
    const someResidents = await prisma.resident.findMany({ where: { hostelId: hostel.id }, take: 3 });
    if (someResidents.length) {
      await prisma.maintenanceTicket.create({ data: { hostelId: hostel.id, residentId: someResidents[0].id, title: "AC not cooling", description: "Room AC needs gas refill", priority: "HIGH", status: "OPEN", estimatedCost: 5000 } });
      await prisma.maintenanceTicket.create({ data: { hostelId: hostel.id, title: "Water motor issue", priority: "URGENT", status: "IN_PROGRESS", estimatedCost: 8000 } });
      await prisma.complaint.create({ data: { hostelId: hostel.id, residentId: someResidents[1]?.id, category: "FOOD", subject: "Food quality", description: "Dinner quality declined this week", status: "OPEN" } });
    }

    // Notices
    await prisma.notice.create({ data: { hostelId: hostel.id, type: "PAYMENT_REMINDER", title: "Rent due reminder", body: "Please clear this month's rent by the 5th.", pinned: true } });

    // Weekly menu
    const menuMeals = ["BREAKFAST", "LUNCH", "DINNER"] as const;
    const dishes: Record<string, string[]> = { BREAKFAST: ["Paratha & Egg", "Halwa Puri", "Toast & Omelette"], LUNCH: ["Chicken Biryani", "Daal Chawal", "Chicken Karahi & Roti"], DINNER: ["Aloo Gosht & Roti", "Vegetable Pulao", "Chicken Qorma & Naan"] };
    for (let d = 0; d < 7; d++) {
      for (const meal of menuMeals) {
        await prisma.menu.create({ data: { hostelId: hostel.id, dayOfWeek: d, mealType: meal, description: rand(dishes[meal]) } });
      }
    }
  }

  // Owner capital & loan (company-level)
  await prisma.investment.create({ data: { type: "OWNER_INVESTMENT", amount: 5000000, date: new Date(2024, 0, 1), source: "Ahmed Raza", purpose: "Initial setup, deposits & furniture" } });
  await prisma.investment.create({ data: { type: "PARTNER_INVESTMENT", amount: 2000000, date: new Date(2024, 2, 1), source: "Business Partner", purpose: "Expansion to Rawalpindi" } });
  await prisma.loan.create({ data: { lender: "Meezan Bank", principal: 3000000, amountRepaid: 500000, interestRate: 14, date: new Date(2024, 3, 1), notes: "Working capital loan", status: "PARTIALLY_REPAID" } });

  // Company-wide notice
  await prisma.notice.create({ data: { type: "GENERAL", title: "Welcome to XYZ Hostel Group", body: "New management portal is now live for all branches.", pinned: true } });

  // Give one resident a portal login so the resident self-service portal is testable.
  const sampleResident = await prisma.resident.findFirst({ where: { status: "ACTIVE", email: null } });
  if (sampleResident) {
    const residentUser = await prisma.user.create({
      data: { companyId: company.id, name: sampleResident.fullName, email: "resident@xyzhostel.com", passwordHash: pw, role: Role.RESIDENT },
    });
    await prisma.resident.update({ where: { id: sampleResident.id }, data: { userId: residentUser.id, email: "resident@xyzhostel.com" } });
    console.log("  Resident:   resident@xyzhostel.com");
  }

  console.log(`🏨 ${hostels.length} hostels, 👥 ${residentCount} residents seeded.`);
  console.log("✅ Seed complete.");
  console.log("\nLogin accounts (password: Password123):");
  console.log("  Owner:      owner@xyzhostel.com");
  console.log("  Manager:    manager@xyzhostel.com");
  console.log("  Accountant: accountant@xyzhostel.com");
  console.log("  Kitchen:    kitchen@xyzhostel.com");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
