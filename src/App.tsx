import React from 'react';
import { 
  createRouter, 
  createRoute, 
  createRootRoute, 
  RouterProvider, 
  Outlet 
} from '@tanstack/react-router';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './pages/Dashboard';
import { AuthPage } from './pages/AuthPage';
import { Toaster } from 'react-hot-toast';
import { blink } from './blink/client';
import { useNavigate } from '@tanstack/react-router';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    // Quick check to see if we have blink auth or mock token
    const checkAuth = async () => {
      try {
        if ('me' in blink.auth) {
          const user = await blink.auth.me();
          setIsAuthenticated(!!user);
          if (!user) navigate({ to: '/auth' });
        } else {
          // Fallback check
          const hasToken = localStorage.getItem('blink_local_mock_token');
          setIsAuthenticated(!!hasToken);
          if (!hasToken) navigate({ to: '/auth' });
        }
      } catch {
        setIsAuthenticated(false);
        navigate({ to: '/auth' });
      }
    };
    checkAuth();
  }, [navigate]);

  if (isAuthenticated === null) return <div className="min-h-screen bg-[#020817] flex items-center justify-center text-slate-400">Loading workspace...</div>;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

// Create a root route
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster position="top-right" />
    </>
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
