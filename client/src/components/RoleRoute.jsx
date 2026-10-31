import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../store/authStore';

export const RoleRoute = ({ allowedRoles }) => {
  const user = useAuthStore((state) => state.user);

  return allowedRoles.includes(user?.role) ? <Outlet /> : <Navigate replace to="/dashboard" />;
};
