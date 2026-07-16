import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { PageLoader } from "./components/ui";
import Layout from "./components/Layout";

import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import HostelsPage from "./pages/HostelsPage";
import RoomsPage from "./pages/RoomsPage";
import ResidentsPage from "./pages/ResidentsPage";
import ResidentDetailPage from "./pages/ResidentDetailPage";
import AdmissionsPage from "./pages/AdmissionsPage";
import PaymentsPage from "./pages/PaymentsPage";
import ExpensesPage from "./pages/ExpensesPage";
import IncomePage from "./pages/IncomePage";
import ProfitLossPage from "./pages/ProfitLossPage";
import CapitalPage from "./pages/CapitalPage";
import FoodPage from "./pages/FoodPage";
import InventoryPage from "./pages/InventoryPage";
import SuppliersPage from "./pages/SuppliersPage";
import StaffPage from "./pages/StaffPage";
import MaintenancePage from "./pages/MaintenancePage";
import ComplaintsPage from "./pages/ComplaintsPage";
import VisitorsPage from "./pages/VisitorsPage";
import NoticesPage from "./pages/NoticesPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import AuditPage from "./pages/AuditPage";
import SettingsPage from "./pages/SettingsPage";
import PortalPage from "./pages/PortalPage";
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

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Resident portal has its own full-screen chrome, outside the admin Layout */}
      <Route path="/portal" element={<Protected perm="portal.view"><PortalPage /></Protected>} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<RoleHome loading={loading} isResident={user?.role === "RESIDENT"} />} />
        <Route path="/hostels" element={<Protected perm="hostels.view"><HostelsPage /></Protected>} />
        <Route path="/rooms" element={<Protected perm="rooms.view"><RoomsPage /></Protected>} />
        <Route path="/residents" element={<Protected perm="residents.view"><ResidentsPage /></Protected>} />
        <Route path="/residents/:id" element={<Protected perm="residents.view"><ResidentDetailPage /></Protected>} />
        <Route path="/admissions" element={<Protected perm="admissions.manage"><AdmissionsPage /></Protected>} />
        <Route path="/payments" element={<Protected perm="payments.view"><PaymentsPage /></Protected>} />
        <Route path="/expenses" element={<Protected perm="expenses.view"><ExpensesPage /></Protected>} />
        <Route path="/income" element={<Protected perm="income.view"><IncomePage /></Protected>} />
        <Route path="/profit-loss" element={<Protected perm="finance.viewProfit"><ProfitLossPage /></Protected>} />
        <Route path="/capital" element={<Protected perm="capital.view"><CapitalPage /></Protected>} />
        <Route path="/food" element={<Protected perm="food.view"><FoodPage /></Protected>} />
        <Route path="/inventory" element={<Protected perm="inventory.view"><InventoryPage /></Protected>} />
        <Route path="/suppliers" element={<Protected perm="suppliers.view"><SuppliersPage /></Protected>} />
        <Route path="/staff" element={<Protected perm="staff.view"><StaffPage /></Protected>} />
        <Route path="/maintenance" element={<Protected perm="maintenance.view"><MaintenancePage /></Protected>} />
        <Route path="/complaints" element={<Protected perm="complaints.view"><ComplaintsPage /></Protected>} />
        <Route path="/visitors" element={<Protected perm="visitors.view"><VisitorsPage /></Protected>} />
        <Route path="/notices" element={<Protected perm="notices.view"><NoticesPage /></Protected>} />
        <Route path="/reports" element={<Protected perm="reports.view"><ReportsPage /></Protected>} />
        <Route path="/users" element={<Protected perm="users.manage"><UsersPage /></Protected>} />
        <Route path="/audit" element={<Protected perm="audit.view"><AuditPage /></Protected>} />
        <Route path="/settings" element={<Protected perm="settings.manage"><SettingsPage /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RoleHome({ loading, isResident }: { loading: boolean; isResident?: boolean }) {
  if (loading) return <PageLoader />;
  if (isResident) return <Navigate to="/portal" replace />;
  return <DashboardPage />;
}
