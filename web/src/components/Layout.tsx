import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../context/AuthContext";
import { useHostels } from "../context/HostelContext";
import {
  IconDashboard, IconHostel, IconBed, IconResidents, IconAdmission, IconMoney, IconExpense, IconIncome,
  IconChart, IconFood, IconInventory, IconSupplier, IconStaff, IconMaintenance, IconComplaint, IconVisitor,
  IconNotice, IconReport, IconUsers, IconAudit, IconSettings, IconLogout, IconMenu, IconBell,
} from "./icons";

interface NavItem {
  to: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  perm: string;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: IconDashboard, perm: "dashboard.view" },
  { to: "/hostels", label: "Hostels", icon: IconHostel, perm: "hostels.view" },
  { to: "/rooms", label: "Rooms & Beds", icon: IconBed, perm: "rooms.view" },
  { to: "/residents", label: "Residents", icon: IconResidents, perm: "residents.view" },
  { to: "/admissions", label: "Admissions", icon: IconAdmission, perm: "admissions.manage" },
  { to: "/payments", label: "Payments", icon: IconMoney, perm: "payments.view" },
  { to: "/expenses", label: "Expenses", icon: IconExpense, perm: "expenses.view" },
  { to: "/income", label: "Income", icon: IconIncome, perm: "income.view" },
  { to: "/profit-loss", label: "Profit & Loss", icon: IconChart, perm: "finance.viewProfit" },
  { to: "/capital", label: "Capital & Loans", icon: IconMoney, perm: "capital.view" },
  { to: "/food", label: "Food & Kitchen", icon: IconFood, perm: "food.view" },
  { to: "/inventory", label: "Inventory", icon: IconInventory, perm: "inventory.view" },
  { to: "/suppliers", label: "Suppliers", icon: IconSupplier, perm: "suppliers.view" },
  { to: "/staff", label: "Staff", icon: IconStaff, perm: "staff.view" },
  { to: "/maintenance", label: "Maintenance", icon: IconMaintenance, perm: "maintenance.view" },
  { to: "/complaints", label: "Complaints", icon: IconComplaint, perm: "complaints.view" },
  { to: "/visitors", label: "Visitors", icon: IconVisitor, perm: "visitors.view" },
  { to: "/notices", label: "Notices", icon: IconNotice, perm: "notices.view" },
  { to: "/reports", label: "Reports", icon: IconReport, perm: "reports.view" },
  { to: "/users", label: "Users", icon: IconUsers, perm: "users.manage" },
  { to: "/audit", label: "Audit Logs", icon: IconAudit, perm: "audit.view" },
  // Settings (profile + change password) is available to every signed-in staff role.
  { to: "/settings", label: "Settings", icon: IconSettings, perm: "dashboard.view" },
];

// Order used to pick the phone bottom-bar tabs (first 4 the user can access).
const MOBILE_PRIORITY = ["/", "/residents", "/payments", "/rooms", "/food", "/inventory", "/maintenance", "/complaints", "/reports", "/expenses", "/hostels", "/visitors"];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { hostels, selected, setSelected } = useHostels();
  const navigate = useNavigate();
  const location = useLocation();
  const [more, setMore] = useState(false);

  const items = NAV.filter((n) => can(n.perm));

  // Bottom bar = up to 4 priority destinations, then a "More" tab.
  const bottomItems = MOBILE_PRIORITY
    .map((to) => items.find((i) => i.to === to))
    .filter((x): x is NavItem => Boolean(x))
    .slice(0, 4);
  const bottomRoutes = new Set(bottomItems.map((i) => i.to));

  const activeItem = [...NAV].filter((n) => (n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to))).sort((a, b) => b.to.length - a.to.length)[0];
  const pageTitle = activeItem?.label ?? user?.company.name ?? "Hostel Manager";
  const moreActive = !!activeItem && !bottomRoutes.has(activeItem.to);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen lg:flex bg-slate-100">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
          <span className="text-2xl">🏨</span>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{user?.company.name ?? "Hostel Manager"}</p>
            <p className="text-[11px] text-slate-400">Management Platform</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Top app bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 safe-top">
          <div className="flex h-14 lg:h-16 items-center justify-between gap-3 px-4 lg:px-6">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl lg:hidden">🏨</span>
              <h1 className="text-lg font-bold text-slate-900 truncate lg:hidden">{pageTitle}</h1>
              {hostels.length > 1 && (
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value as string)}
                  className="hidden lg:block input bg-white max-w-[220px] py-1.5"
                >
                  <option value="all">All Hostels</option>
                  {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex items-center gap-1 lg:gap-3">
              <button className="relative text-slate-500 hover:text-slate-700 p-2"><IconBell /></button>
              <Link to="/settings" className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-sm">
                {user?.name.charAt(0)}
              </Link>
              <div className="hidden lg:block">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name}</p>
                <p className="text-[11px] text-slate-400 capitalize">{user?.role.toLowerCase()}</p>
              </div>
              <button onClick={handleLogout} className="hidden lg:block btn-ghost p-2" title="Logout"><IconLogout /></button>
            </div>
          </div>
          {/* Mobile hostel switcher (only when more than one) */}
          {hostels.length > 1 && (
            <div className="lg:hidden px-4 pb-2">
              <select value={selected} onChange={(e) => setSelected(e.target.value as string)} className="input bg-white py-1.5">
                <option value="all">All Hostels</option>
                {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}
        </header>

        {/* Page content — extra bottom padding on mobile to clear the tab bar */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full mx-auto pb-24 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* ---------- Mobile bottom tab bar ---------- */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 safe-bottom">
        <div className="flex items-stretch">
          {bottomItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => clsx("tab", isActive && "tab-active")}>
              <item.icon className="h-6 w-6" />
              <span className="truncate max-w-[64px]">{item.label.split(" ")[0]}</span>
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className={clsx("tab", moreActive && "tab-active")}>
            <IconMenu className="h-6 w-6" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* ---------- "More" full menu sheet (mobile) ---------- */}
      {more && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative bg-slate-50 rounded-t-3xl max-h-[85vh] overflow-y-auto safe-bottom animate-[slideup_0.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-50 px-5 pt-3 pb-2">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 mb-3" />
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-bold">{user?.name.charAt(0)}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{user?.role.toLowerCase()} · {user?.company.name}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMore(false)}
                  className={({ isActive }) =>
                    clsx(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center",
                      isActive ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"
                    )
                  }
                >
                  <item.icon className="h-6 w-6" />
                  <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="p-4 pt-0">
              <button onClick={handleLogout} className="btn-danger w-full"><IconLogout className="h-5 w-5" /> Log out</button>
              <p className="mt-3 text-center text-[11px] text-slate-400">Hostel Manager · build {__BUILD_ID__}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
