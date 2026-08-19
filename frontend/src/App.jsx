import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";  
import DashboardLayout from "./layout/DashboardLayout";
import AddData from "./pages/AddData";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import PlaceholderPage from "./pages/PlaceholderPage";
import TowerReports from "./pages/TowerReports";
import UsersAccessPage from "./pages/UsersAccessPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { UserProvider } from "./context/UserContext";
import KpiDashboard from "./pages/KpiDashboard";
import NSOReports from "./pages/NsoReports";
import NsoDashboard from "./pages/NsoDashboard";
import FiberInventory from "./pages/FiberInventory";
import Physical from "./pages/Physical";
import PhysicalDashboard from "./pages/PhysicalDashboard";
import AttendanceManagement from "./pages/AttendanceManagement";
import Scrum from "./pages/Scrum";
import ScrumDashboard from "./pages/ScrumDashboard";
import BillingStatus from "./pages/BillingStatus";
import BillingDashboard from "./pages/BillingDashboard";
import Revenue from "./pages/Revenue";
import HrDashboard from "./pages/HrDashboard";
import HrAnalyticsV2 from "./pages/HrAnalyticsV2";
import Signoff from "./pages/Signoff";
import ManpowerSettings from "./pages/ManpowerSettings";
import NewJoining from "./pages/NewJoining";
import TrainingDashboard from "./pages/Training/Dashboard";
import TrainingNewRegistrations from "./pages/Training/NewRegistrations";
import TrainingEmployeeList from "./pages/Training/EmployeeList";
import TrainingEmployeeProfile from "./pages/Training/EmployeeProfile";
import TrainingEmployeeEdit from "./pages/Training/EmployeeEdit";
import TrainingDocuments from "./pages/Training/Documents";
import TrainingVerification from "./pages/Training/Verification";
import TrainingReports from "./pages/Training/Reports";
import TrainingSettings from "./pages/Training/Settings";
import Profile from "./pages/Profile";
import KpiPenalty from "./pages/KpiPenalty";
import GeneralPenalty from "./pages/GeneralPenalty";

function App() {
  return (

    <UserProvider>
    <BrowserRouter>
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: "rgb(var(--color-surface-elevated))",
          color: "rgb(var(--color-text-primary))",
          border: "1px solid rgb(var(--color-border))",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
        },
        success: { iconTheme: { primary: "rgb(var(--color-success))", secondary: "rgb(var(--color-surface-elevated))" } },
        error: { iconTheme: { primary: "rgb(var(--color-danger))", secondary: "rgb(var(--color-surface-elevated))" } },
      }}
    />

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
  <Route index element={
    <ProtectedRoute page={"Dashboard"}>
      <Dashboard />
    </ProtectedRoute>
  } />

  <Route path="add-data" element={
    <ProtectedRoute page={"Add Data"}>
      <AddData />
    </ProtectedRoute>
  } />

  <Route path="profile" element={
    <ProtectedRoute>
      <Profile />
    </ProtectedRoute>
  } />

  {/* Billing */}
  <Route path="billing" element={
    <ProtectedRoute page={"Billing Dashboard"}>
      <BillingDashboard />
    </ProtectedRoute>
  } />

  <Route path="billing/status" element={
    <ProtectedRoute page={"Billing Status"}>
      <BillingStatus />
    </ProtectedRoute>
  } />

  <Route path="billing/revenue" element={
    <ProtectedRoute page={"Revenue"}>
      <Revenue />
    </ProtectedRoute>
  } />

  <Route path="billing/penalties" element={
    <ProtectedRoute page={"KPIs Penalty"}>
      <PlaceholderPage />
    </ProtectedRoute>
  } />

  <Route path="billing/penalties/kpis" element={
    <ProtectedRoute page={"KPIs Penalty"}>
      <KpiPenalty />
    </ProtectedRoute>
  } />

  <Route path="billing/penalties/general" element={
    <ProtectedRoute page={"General Penalties"}>
      <GeneralPenalty />
    </ProtectedRoute>
  } />

  {/* Manpower */}
  <Route path="manpower/physical" element={
    <ProtectedRoute page={"Physical"}>
      <Physical />
    </ProtectedRoute>
  } />

  <Route path="manpower/physical/dashboard" element={
    <ProtectedRoute page={"Physical"}>
      <PhysicalDashboard />
    </ProtectedRoute>
  } />

  <Route path="manpower/attendance" element={
    <ProtectedRoute page={"Attendance"}>
      <AttendanceManagement />
    </ProtectedRoute>
  } />

  <Route path="manpower/scrum" element={
    <ProtectedRoute page={"Scrum"}>
      <Scrum />
    </ProtectedRoute>
  } />

  <Route path="manpower/scrum-dashboard" element={
    <ProtectedRoute page={"Scrum Dashboard"}>
      <ScrumDashboard />
    </ProtectedRoute>
  } />

  <Route path="manpower/new-joining" element={
    <ProtectedRoute page={"New Joining"}>
      <NewJoining />
    </ProtectedRoute>
  } />

  {/* Training */}
  <Route path="training" element={
    <ProtectedRoute page={"Training"}>
      <TrainingDashboard />
    </ProtectedRoute>
  } />

  <Route path="training/registrations" element={
    <ProtectedRoute page={"Training"}>
      <TrainingNewRegistrations />
    </ProtectedRoute>
  } />

  <Route path="training/employees" element={
    <ProtectedRoute page={"Training"}>
      <TrainingEmployeeList />
    </ProtectedRoute>
  } />

  <Route path="training/employees/:id" element={
    <ProtectedRoute page={"Training"}>
      <TrainingEmployeeProfile />
    </ProtectedRoute>
  } />

  <Route path="training/employees/:id/edit" element={
    <ProtectedRoute page={"Training"}>
      <TrainingEmployeeEdit />
    </ProtectedRoute>
  } />

  <Route path="training/documents" element={
    <ProtectedRoute page={"Training"}>
      <TrainingDocuments />
    </ProtectedRoute>
  } />

  <Route path="training/verification" element={
    <ProtectedRoute page={"Training"}>
      <TrainingVerification />
    </ProtectedRoute>
  } />

  <Route path="training/reports" element={
    <ProtectedRoute page={"Training"}>
      <TrainingReports />
    </ProtectedRoute>
  } />

  <Route path="training/settings" element={
    <ProtectedRoute page={"Training"}>
      <TrainingSettings />
    </ProtectedRoute>
  } />

  <Route path="hr-dashboard" element={
  <ProtectedRoute page={"HR Dashboard"}>
    <HrDashboard />
  </ProtectedRoute>
} />

  <Route path="hr-analytics-v2" element={
  <ProtectedRoute page={"HR Analytics V2"}>
    <HrAnalyticsV2 />
  </ProtectedRoute>
} />

<Route
  path="manpower/signoff"
  element={
    <ProtectedRoute page={"Signoff"}>
      <Signoff />
    </ProtectedRoute>
  }
/>

<Route
  path="manpower/settings"
  element={
    <ProtectedRoute page={"Manpower Settings"}>
      <ManpowerSettings />
    </ProtectedRoute>
  }
/>

  {/* Users */}
  <Route path="users-access" element={
    <ProtectedRoute page={"Users"}>
      <UsersAccessPage />
    </ProtectedRoute>
  } />

  {/* Uptime */}
  <Route path="uptime/tower" element={
    <ProtectedRoute page={"Uptime Tower"}>
      <div>Tower Page</div>
    </ProtectedRoute>
  } />

  <Route path="uptime/fiber" element={
    <ProtectedRoute page={"Uptime Fiber"}>
      <div>Fiber Page</div>
    </ProtectedRoute>
  } />

  <Route path="uptime/fttx" element={
    <ProtectedRoute page={"Uptime FTTx"}>
      <div>FTTx Page</div>
    </ProtectedRoute>
  } />

  {/* KPI */}
  <Route path="kpi/tower" element={
    <ProtectedRoute page={"Tower KPI"}>
      <div>Tower KPI Page</div>
    </ProtectedRoute>
  } />

  <Route path="kpi/fiber" element={
    <ProtectedRoute page={"Fiber KPI"}>
      <div>Fiber KPI Page</div>
    </ProtectedRoute>
  } />

  {/* Reports */}

{/* Reports */}

<Route path="reports" element={
  <ProtectedRoute page={"KPI Dashboard"}>
    <KpiDashboard />
  </ProtectedRoute>
} />

<Route path="reports/fiber/nso-dashboard" element={
    <ProtectedRoute page={"NSO Fiber Performance"}>
      <NsoDashboard />
    </ProtectedRoute>
  } />

  <Route path="reports/fiber/nso" element={
  <ProtectedRoute page={"NSO Reports"}>
    <NSOReports />
  </ProtectedRoute>
} />

<Route path="reports/fiber/inventory" element={
  <ProtectedRoute page={"Fiber Reports"}>
    <FiberInventory />
  </ProtectedRoute>
} />

<Route path="reports/view" element={
  <ProtectedRoute page={"View Reports"}>
    <div>View Reports Page</div>
  </ProtectedRoute>
} />

<Route path="reports/:siteCategory" element={
  <ProtectedRoute page={"Tower Reports"}>
    <TowerReports />
  </ProtectedRoute>
} />

  
</Route>
        
         <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
    </UserProvider>
  );
}

export default App;
