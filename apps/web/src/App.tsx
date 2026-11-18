import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HistoryPage />} />
          <Route path="/themes" element={<Navigate to="/" replace />} />
          <Route path="/history" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
