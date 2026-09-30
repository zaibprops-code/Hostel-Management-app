import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ComponentType, ReactNode, Suspense, lazy, useEffect } from "react";
import { useAuth } from "./context/AuthContext";
import { PageLoader } from "./components/ui";
import Layout from "./components/Layout";

// Pages load on demand (one small file each) instead of the whole app up
// front, so the first screen appears much sooner — especially on mobile data.
// If a deploy replaced the files while the app was open, a missing page file is
// fixed by reloading once.
function lazyPage(load: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(() =>
    load().catch((err) => {
      if (!sessionStorage.getItem("chunk-reload")) {
        sessionStorage.setItem("chunk-reload", "1");
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw err;
    })
  );
}
// Warm the page files in the background once the app is idle, so moving
// between pages is instant after the first load.
export function prefetchPages() {
  const all = [() => import("./pages/ForgotPasswordPage"), () => import("./pages/ResetPasswordPage"), () => import("./pages/IntakePage"), () => import("./pages/DashboardPage"), () => import("./pages/HostelsPage"), () => import("./pages/RoomsPage"), () => import("./pages/ResidentDetailPage"), () => import("./pages/AdmissionsPage"), () => import("./pages/PaymentsPage"), () => import("./pages/ExpensesPage"), () => import("./pages/IncomePage"), () => import("./pages/CapitalPage"), () => import("./pages/FoodPage"), () => import("./pages/InventoryPage"), () => import("./pages/AssetsPage"), () => import("./pages/StaffPage"), () => import("./pages/MaintenancePage"), () => import("./pages/ComplaintsPage"), () => import("./pages/VisitorsPage"), () => import("./pages/NoticesPage"), () => import("./pages/ReportsPage"), () => import("./pages/UsersPage"), () => import("./pages/AuditPage"), () => import("./pages/SettingsPage"), () => import("./pages/PortalPage")];
  const run = () => all.forEach((load) => load().catch(() => {}));
  const w = window as any;
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

import LoginPage from "./pages/LoginPage";
const ForgotPasswordPage = lazyPage(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazyPage(() => import("./pages/ResetPasswordPage"));
const IntakePage = lazyPage(() => import("./pages/IntakePage"));
const DashboardPage = lazyPage(() => import("./pages/DashboardPage"));
const HostelsPage = lazyPage(() => import("./pages/HostelsPage"));
const RoomsPage = lazyPage(() => import("./pages/RoomsPage"));
const ResidentDetailPage = lazyPage(() => import("./pages/ResidentDetailPage"));
const AdmissionsPage = lazyPage(() => import("./pages/AdmissionsPage"));
const PaymentsPage = lazyPage(() => import("./pages/PaymentsPage"));
const ExpensesPage = lazyPage(() => import("./pages/ExpensesPage"));
const IncomePage = lazyPage(() => import("./pages/IncomePage"));
const CapitalPage = lazyPage(() => import("./pages/CapitalPage"));
const FoodPage = lazyPage(() => import("./pages/FoodPage"));
const InventoryPage = lazyPage(() => import("./pages/InventoryPage"));
const AssetsPage = lazyPage(() => import("./pages/AssetsPage"));
const StaffPage = lazyPage(() => import("./pages/StaffPage"));
const MaintenancePage = lazyPage(() => import("./pages/MaintenancePage"));
const ComplaintsPage = lazyPage(() => import("./pages/ComplaintsPage"));
const VisitorsPage = lazyPage(() => import("./pages/VisitorsPage"));
const NoticesPage = lazyPage(() => import("./pages/NoticesPage"));
const ReportsPage = lazyPage(() => import("./pages/ReportsPage"));
const UsersPage = lazyPage(() => import("./pages/UsersPage"));
const AuditPage = lazyPage(() => import("./pages/AuditPage"));
const SettingsPage = lazyPage(() => import("./pages/SettingsPage"));
const PortalPage = lazyPage(() => import("./pages/PortalPage"));
import { EmptyState } from "./components/ui";

function Protected({ children, perm }: { children: ReactNode; perm?: string }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (perm && !can(perm)) {
    return <EmptyState title="Access denied" message="You do not have permission to view this page." />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();
  useEffect(() => {
    sessionStorage.removeItem("chunk-reload");
    if (user) prefetchPages();
  }, [user]);

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Public resident self-intake form (no login) */}
      <Route path="/intake/:token" element={<IntakePage />} />

      {/* Resident portal has its own full-screen chrome, outside the admin Layout */}
      <Route path="/portal" element={<Protected perm="portal.view"><PortalPage /></Protected>} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<RoleHome loading={loading} isResident={user?.role === "RESIDENT"} />} />
        <Route path="/hostels" element={<Protected perm="hostels.view"><HostelsPage /></Protected>} />
        <Route path="/rooms" element={<Protected perm="rooms.view"><RoomsPage /></Protected>} />
        <Route path="/assets" element={<Protected perm="assets.view"><AssetsPage /></Protected>} />
        {/* The standalone Residents list was merged into Admissions; /residents
            redirects there, while the per-resident detail page stays. */}
        <Route path="/residents" element={<Navigate to="/admissions" replace />} />
        <Route path="/residents/:id" element={<Protected perm="residents.view"><ResidentDetailPage /></Protected>} />
        <Route path="/admissions" element={<Protected perm="admissions.manage"><AdmissionsPage /></Protected>} />
        <Route path="/payments" element={<Protected perm="payments.view"><PaymentsPage /></Protected>} />
        <Route path="/expenses" element={<Protected perm="expenses.view"><ExpensesPage /></Protected>} />
        <Route path="/income" element={<Protected perm="income.view"><IncomePage /></Protected>} />
        {/* Profit & Loss now lives inside Reports; Suppliers inside Inventory. */}
        <Route path="/profit-loss" element={<Navigate to="/reports" replace />} />
        <Route path="/capital" element={<Protected perm="capital.view"><CapitalPage /></Protected>} />
        <Route path="/food" element={<Protected perm="food.view"><FoodPage /></Protected>} />
        <Route path="/inventory" element={<Protected perm="inventory.view"><InventoryPage /></Protected>} />
        <Route path="/suppliers" element={<Navigate to="/inventory" replace />} />
        <Route path="/staff" element={<Protected perm="staff.view"><StaffPage /></Protected>} />
        <Route path="/maintenance" element={<Protected perm="maintenance.view"><MaintenancePage /></Protected>} />
        <Route path="/complaints" element={<Protected perm="complaints.view"><ComplaintsPage /></Protected>} />
        <Route path="/visitors" element={<Protected perm="visitors.view"><VisitorsPage /></Protected>} />
        <Route path="/notices" element={<Protected perm="notices.view"><NoticesPage /></Protected>} />
        <Route path="/reports" element={<Protected perm="reports.view"><ReportsPage /></Protected>} />
        <Route path="/users" element={<Protected perm="users.manage"><UsersPage /></Protected>} />
        <Route path="/audit" element={<Protected perm="audit.view"><AuditPage /></Protected>} />
        <Route path="/settings" element={<Protected perm="dashboard.view"><SettingsPage /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

function RoleHome({ loading, isResident }: { loading: boolean; isResident?: boolean }) {
  if (loading) return <PageLoader />;
  if (isResident) return <Navigate to="/portal" replace />;
  return <DashboardPage />;
}
