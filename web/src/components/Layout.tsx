import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
  { to: "/settings", label: "Settings", icon: IconSettings, perm: "settings.manage" },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { hostels, selected, setSelected } = useHostels();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => can(n.perm));

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 text-slate-300 transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
          <span className="text-2xl">🏨</span>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{user?.company.name ?? "Hostel MS"}</p>
            <p className="text-[11px] text-slate-400">Management Platform</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 h-[calc(100vh-4rem)]">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setOpen(false)}
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

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button className="btn-ghost lg:hidden p-2" onClick={() => setOpen(true)}>
              <IconMenu />
            </button>
            {hostels.length > 0 && can("hostels.view") && (
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value as string)}
                className="input bg-white max-w-[220px] py-1.5"
              >
                <option value="all">All Hostels</option>
                {hostels.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="relative text-slate-500 hover:text-slate-700 p-2">
              <IconBell />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-sm">
                {user?.name.charAt(0)}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name}</p>
                <p className="text-[11px] text-slate-400 capitalize">{user?.role.toLowerCase()}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="btn-ghost p-2" title="Logout">
              <IconLogout />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
