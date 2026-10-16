import { Brand, Button, FullPageSpinner, useAuth } from '@enhora/ui';
import { Link, Navigate, NavLink, Outlet } from 'react-router';

const NAV = [
  { to: '/panel', label: 'Operaciones', end: true },
  { to: '/panel/aprobaciones', label: 'Aprobaciones' },
  { to: '/panel/zonas', label: 'Zonas' },
  { to: '/panel/tarifas', label: 'Tarifas' },
  { to: '/panel/auditoria', label: 'Auditoría' },
];

/** The admin panel is only for ADMIN accounts; anyone else goes back to their own screens. */
export function RequireAdmin() {
  const { state, logout } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous') return <Navigate to="/ingresar" replace />;
  if (state.account.role !== 'ADMIN') return <Navigate to="/" replace />;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/panel" className="flex items-center gap-2">
            <Brand />
            <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white">Admin</span>
          </Link>
          <Button variant="ghost" className="min-h-9 px-3" onClick={() => void logout()}>
            Salir
          </Button>
        </div>
        <nav
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm"
          aria-label="Secciones del panel"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-lg px-3 py-1.5 font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
