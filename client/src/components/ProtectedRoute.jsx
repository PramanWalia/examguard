import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../store/authStore';
import { LoadingState } from './States';

export const ProtectedRoute = () => {
  const user = useAuthStore((state) => state.user);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) return <LoadingState label="Restoring your secure session" />;

  return user ? (
    <Outlet />
  ) : (
    <Navigate replace state={{ from: location.pathname + location.search }} to="/login" />
  );
};

// Keeps a signed-in user off the login/register screens.
export const PublicOnlyRoute = ({ children }) => {
  const user = useAuthStore((state) => state.user);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) return <LoadingState label="Restoring your secure session" />;
  if (user) return <Navigate replace to={location.state?.from || '/dashboard'} />;
  return children;
};

export default ProtectedRoute;
