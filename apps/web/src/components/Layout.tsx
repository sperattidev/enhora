import { Link, Navigate, NavLink, Outlet } from 'react-router';
import { useAuth, Brand, Alert, Button, FullPageSpinner } from '@enhora/ui';

/** Only merchants get past this; everyone else is sent to the login page. */
export function RequireMerchant() {
  const { state, logout } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous') return <Navigate to="/ingresar" replace />;
  if (state.account.role === 'ADMIN') return <Navigate to="/panel" replace />;
  if (state.account.role !== 'MERCHANT' || !state.account.merchant) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
        <Alert tone="warning">Esta app es para comercios. Si sos cadete, usá la app de cadetes.</Alert>
        <Button variant="secondary" onClick={() => void logout()}>
          Salir
        </Button>
      </main>
    );
  }
  return <MerchantLayout />;
}

function MerchantLayout() {
  const { state, logout } = useAuth();
  if (state.status !== 'authenticated') return null;
  const merchant = state.account.merchant!;

  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link to="/envios" aria-label="EnHora, inicio">
            <Brand />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink
              to="/envios"
              end
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              Envíos
            </NavLink>
            <Button variant="ghost" onClick={() => void logout()} className="min-h-9 px-3">
              Salir
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="mb-4 text-sm text-slate-500">{merchant.displayName}</p>
        {merchant.status === 'PENDING' && (
          <div className="mb-4">
            <Alert tone="warning">
              Tu comercio está en revisión. Ya podés cotizar envíos; vas a poder pedir cadetes cuando lo aprobemos.
            </Alert>
          </div>
        )}
        {merchant.status === 'SUSPENDED' && (
          <div className="mb-4">
            <Alert tone="danger">Tu comercio está suspendido. Escribinos para resolverlo.</Alert>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}

/** Pages for people who are not logged in; logged-in merchants go straight to their envíos. */
export function PublicOnly() {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'authenticated' && state.account.role === 'ADMIN') return <Navigate to="/panel" replace />;
  if (state.status === 'authenticated' && state.account.role === 'MERCHANT') return <Navigate to="/envios" replace />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <Brand className="text-2xl" />
        <p className="mt-2 text-slate-600">Cadetes para tu comercio, cuando los necesitás.</p>
      </div>
      <Outlet />
    </main>
  );
}
