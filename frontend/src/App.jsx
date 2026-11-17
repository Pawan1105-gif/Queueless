import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import OrganizationsPage from "./pages/OrganizationsPage.jsx";
import OrganizationDetailsPage from "./pages/OrganizationDetailsPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import { AppointmentDetailsPage, AppointmentsPage } from "./pages/AppointmentsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import AmbulancePage from "./pages/AmbulancePage.jsx";
import MedicationSearchPage from "./pages/MedicationSearchPage.jsx";
const AnatomyStudyPage = lazy(() => import("./pages/AnatomyStudyPage.jsx"));

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<AppShell />}>
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="organizations/:organizationId" element={<OrganizationDetailsPage />} />
          <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="appointments" element={<ProtectedRoute><AppointmentsPage /></ProtectedRoute>} />
          <Route path="appointments/:appointmentId" element={<ProtectedRoute><AppointmentDetailsPage /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="ambulance" element={<ProtectedRoute><AmbulancePage /></ProtectedRoute>} />
          <Route path="medications" element={<ProtectedRoute roles={["customer"]}><MedicationSearchPage /></ProtectedRoute>} />
          <Route path="study" element={<ProtectedRoute roles={["customer"]}><Suspense fallback={<div className="empty-panel">Loading the learning lab…</div>}><AnatomyStudyPage /></Suspense></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
