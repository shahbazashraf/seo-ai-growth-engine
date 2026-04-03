import React, { useEffect } from 'react';
import { 
  createRouter, 
  createRoute, 
  createRootRoute, 
  RouterProvider, 
  Outlet,
  useNavigate
} from '@tanstack/react-router';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './pages/Dashboard';
import { AuthPage } from './pages/AuthPage';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: '/auth' });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="min-h-screen bg-[#020817] flex items-center justify-center text-white">Loading...</div>;
  }

  return user ? <>{children}</> : null;
}

// Create a root route
const rootRoute = createRootRoute({
  component: () => (
    <AuthProvider>
      <Outlet />
      <Toaster position="top-right" />
    </AuthProvider>
  ),
});

// Define routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  ),
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth',
  component: AuthPage,
});

// Create the router
const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute, authRoute]);
const router = createRouter({ routeTree });

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
