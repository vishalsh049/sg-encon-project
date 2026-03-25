import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DashboardLayout from "./layout/DashboardLayout";


function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Login */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        {/* Dashboard Layout (with sidebar) */}
        <Route path="/dashboard" element={<DashboardLayout />}>

          {/* Default page */}
          <Route index element={<Dashboard />} />

          {/* Other pages */}
          <Route path="overall-nwa" element={<div>Overall NWA Page</div>} />
          <Route path="scope" element={<div>Scope Page</div>} />
          

        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;