import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";  
import DashboardLayout from "./layout/DashboardLayout";
import AddData from "./pages/AddData";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import PlaceholderPage from "./pages/PlaceholderPage";
import TowerReports from "./pages/TowerReports";
import UsersAccessPage from "./pages/UsersAccessPage";
import { UserProvider } from "./context/UserContext";
import NSOReports from "./pages/NsoReports";
import FiberInventory from "./pages/FiberInventory";
import Physical from "./pages/Physical";
import Scrum from "./pages/Scrum";

function App() {
  return (

    <UserProvider>
    <BrowserRouter>
    <Toaster position="top-right" />

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="add-data" element={<AddData />} />

          <Route path="billing/status" element={<PlaceholderPage />} />
          <Route path="billing/revenue" element={<PlaceholderPage />} />
          <Route path="billing/penalties" element={<PlaceholderPage />} />
          <Route path="billing/penalties/kpis" element={<PlaceholderPage />} />
          <Route path="billing/penalties/general" element={<PlaceholderPage />} />

          <Route path="manpower/physical" element={<Physical />} />
          <Route path="manpower/scrum" element={<Scrum />} />
          <Route path="users-access" element={<UsersAccessPage />} />

          <Route path="uptime/tower" element={<div>Tower Page</div>} />
          <Route path="uptime/fiber" element={<div>Fiber Page</div>} />
          <Route path="uptime/fttx" element={<div>FTTx Page</div>} />

          <Route path="kpi/tower" element={<div>Tower KPI Page</div>} />
          <Route path="kpi/fiber" element={<div>Fiber KPI Page</div>} />

          <Route path="reports/:siteCategory" element={<TowerReports />} />
          <Route path="reports/view" element={<div>View Reports Page</div>} />
          <Route path="/dashboard/reports/fiber/nso" element={<NSOReports />} />
          <Route path="/dashboard/reports/fiber/inventory" element={<FiberInventory />} />


        </Route>
         <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
    </UserProvider>
  );
}

export default App;
