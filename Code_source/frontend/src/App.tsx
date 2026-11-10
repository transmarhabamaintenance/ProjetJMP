import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { RequireAdmin, RequireAuth } from './lib/auth';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/ImportPage';
import LoginPage from './pages/LoginPage';
import MapPage from './pages/MapPage';
import PlanPage from './pages/PlanPage';
import PlanifierPage from './pages/PlanifierPage';
import SettingsPage from './pages/SettingsPage';
import SafetyPage from './pages/SafetyPage';
import StationsPage from './pages/StationsPage';
import TripDetail from './pages/TripDetail';
import UsersPage from './pages/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="plan/:id" element={<TripDetail />} />
        <Route path="planifier" element={<PlanifierPage />} />
        <Route path="carte" element={<MapPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="stations" element={<StationsPage />} />
        <Route path="parametres" element={<SettingsPage />} />
        <Route path="utilisateurs" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
        <Route path="securite" element={<RequireAdmin><SafetyPage /></RequireAdmin>} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
