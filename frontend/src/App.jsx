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
import NSOReports from "./pages/NsoReports";
import FiberInventory from "./pages/FiberInventory";
import Physical from "./pages/Physical";
import Scrum from "./pages/Scrum";
import BillingStatus from "./pages/BillingStatus";
import BillingDashboard from "./pages/BillingDashboard";
import Revenue from "./pages/Revenue";

function App() {
  return (

    <UserProvider>
    <BrowserRouter>
    <Toaster position="top-right" />

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

  {/* Manpower */}
  <Route path="manpower/physical" element={
    <ProtectedRoute page={"Physical"}>
      <Physical />
    </ProtectedRoute>
  } />

  <Route path="manpower/scrum" element={
    <ProtectedRoute page={"Scrum"}>
      <Scrum />
    </ProtectedRoute>
  } />

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
  <Route path="reports/:siteCategory" element={
    <ProtectedRoute page={"Tower Reports"}>
      <TowerReports />
    </ProtectedRoute>
  } />

  <Route path="reports/view" element={
    <ProtectedRoute page={"View Reports"}>
      <div>View Reports Page</div>
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
  
</Route>
        
         <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
    </UserProvider>
  );
}

export default App;
