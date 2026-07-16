// Lightweight inline SVG icon set (stroke-based, 24x24).
type P = { className?: string };
const s = (path: string) => ({ className }: P) =>
  (
    <svg className={className ?? "h-5 w-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {path.split("|").map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );

export const IconDashboard = s("M3 13h8V3H3v10Z|M13 21h8V11h-8v10Z|M13 3v6h8V3h-8Z|M3 21h8v-4H3v4Z");
export const IconHostel = s("M3 21h18|M5 21V7l7-4 7 4v14|M9 21v-6h6v6|M9 10h.01|M15 10h.01");
export const IconBed = s("M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8|M2 14h20|M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3");
export const IconResidents = s("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75");
export const IconAdmission = s("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M19 8v6|M22 11h-6");
export const IconMoney = s("M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6");
export const IconExpense = s("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z|M8 12h8");
export const IconIncome = s("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z|M12 8v8|M8 12h8");
export const IconChart = s("M3 3v18h18|M18 9l-5 5-3-3-4 4");
export const IconFood = s("M3 2v7a3 3 0 0 0 6 0V2|M6 2v20|M15 2v20|M15 9c0-4 2-7 2-7v20");
export const IconInventory = s("M21 8V21H3V8|M1 3h22v5H1z|M10 12h4");
export const IconSupplier = s("M1 3h15v13H1z|M16 8h4l3 3v5h-7|M5.5 18.5a2 2 0 1 0 0 .01|M18.5 18.5a2 2 0 1 0 0 .01");
export const IconStaff = s("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M19 8v6|M22 11h-6");
export const IconMaintenance = s("M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.7 2.7-2-2 2.7-2.7Z");
export const IconComplaint = s("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z|M12 7v4|M12 15h.01");
export const IconVisitor = s("M20 21v-2a4 4 0 0 0-3-3.87|M4 21v-2a4 4 0 0 1 3-3.87|M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z");
export const IconNotice = s("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0");
export const IconReport = s("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z|M14 2v6h6|M8 13h8|M8 17h8|M8 9h2");
export const IconUsers = s("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75");
export const IconAudit = s("M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11");
export const IconSettings = s("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z");
export const IconLogout = s("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9");
export const IconBell = s("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0");
export const IconMenu = s("M3 12h18|M3 6h18|M3 18h18");
export const IconSearch = s("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z|M21 21l-4.35-4.35");
export const IconPlus = s("M12 5v14|M5 12h14");
export const IconPortal = s("M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10");
