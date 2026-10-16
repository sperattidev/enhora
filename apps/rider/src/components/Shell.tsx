import { Alert, Brand, Button, FullPageSpinner, useAuth } from '@enhora/ui';
import { Navigate, Outlet } from 'react-router';

/** Only couriers get past this; everyone else goes to the login page. */
export function RequireCourier() {
  const { state, logout } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous') return <Navigate to="/ingresar" replace />;
  if (state.account.role !== 'COURIER' || !state.account.courier) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
        <Alert tone="warning">Esta app es para cadetes. Si tenés un comercio, usá la app de comercios.</Alert>
        <Button variant="secondary" onClick={() => void logout()}>
          Salir
        </Button>
      </main>
    );
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col pb-[env(safe-area-inset-bottom)]">
      <header className="flex h-14 items-center justify-between px-4">
        <Brand />
        <Button variant="ghost" className="min-h-9 px-3" onClick={() => void logout()}>
          Salir
        </Button>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6">
        <Outlet />
      </main>
    </div>
  );
}

export function PublicOnly() {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'authenticated' && state.account.role === 'COURIER') return <Navigate to="/" replace />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <Brand className="text-2xl" />
        <p className="mt-2 text-slate-600">Repartí en tu ciudad y cobrá cada entrega.</p>
      </div>
      <Outlet />
    </main>
  );
}
