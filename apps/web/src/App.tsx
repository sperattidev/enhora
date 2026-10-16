import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Link, Navigate, RouterProvider, type RouteObject } from 'react-router';
import { PublicOnly, RequireMerchant } from './components/Layout';
import { AuthProvider } from '@enhora/ui';
import { LoginPage } from './pages/Login';
import { TrackingPage } from './pages/Tracking';

// Customer-facing tracking and login load eagerly; merchant screens are split so the WhatsApp link stays light.
export const routes: RouteObject[] = [
  { path: '/seguimiento/:token', element: <TrackingPage /> },
  {
    element: <PublicOnly />,
    children: [
      { path: '/ingresar', element: <LoginPage /> },
      { path: '/registro', lazy: async () => ({ Component: (await import('./pages/Register')).RegisterPage }) },
    ],
  },
  {
    element: <RequireMerchant />,
    children: [
      { path: '/', element: <Navigate to="/envios" replace /> },
      { path: '/envios', lazy: async () => ({ Component: (await import('./pages/Jobs')).JobsPage }) },
      { path: '/envios/nuevo', lazy: async () => ({ Component: (await import('./pages/NewJob')).NewJobPage }) },
      { path: '/envios/:id', lazy: async () => ({ Component: (await import('./pages/JobDetail')).JobDetailPage }) },
    ],
  },
  {
    path: '/panel',
    lazy: async () => ({ Component: (await import('./admin/AdminLayout')).RequireAdmin }),
    children: [
      { index: true, lazy: async () => ({ Component: (await import('./admin/Overview')).OverviewPage }) },
      { path: 'aprobaciones', lazy: async () => ({ Component: (await import('./admin/Approvals')).ApprovalsPage }) },
      { path: 'zonas', lazy: async () => ({ Component: (await import('./admin/Zones')).ZonesPage }) },
      { path: 'tarifas', lazy: async () => ({ Component: (await import('./admin/Pricing')).PricingPage }) },
      { path: 'auditoria', lazy: async () => ({ Component: (await import('./admin/Audit')).AuditPage }) },
    ],
  },
  { path: '*', element: <NotFound /> },
];

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-2xl font-bold">No encontramos esta página</h1>
      <Link to="/" className="font-semibold text-brand-700 hover:underline">
        Ir al inicio
      </Link>
    </main>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } },
});
const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
