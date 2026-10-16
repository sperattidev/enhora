import { AuthProvider } from '@enhora/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';
import { PublicOnly, RequireCourier } from './components/Shell';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';

export const routes: RouteObject[] = [
  {
    element: <PublicOnly />,
    children: [
      { path: '/ingresar', element: <LoginPage /> },
      { path: '/registro', lazy: async () => ({ Component: (await import('./pages/Register')).RegisterPage }) },
    ],
  },
  { element: <RequireCourier />, children: [{ path: '/', element: <HomePage /> }] },
  { path: '*', element: <Navigate to="/" replace /> },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 2_000, refetchOnWindowFocus: true, retry: 1 } },
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
