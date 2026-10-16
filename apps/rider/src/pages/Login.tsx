import { Alert, ApiError, Button, Card, Field, Input, useAuth } from '@enhora/ui';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
          : err instanceof Error
            ? err.message
            : 'No pudimos iniciar sesión.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h1 className="mb-4 text-xl font-bold">Ingresar</h1>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email">
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Contraseña">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={loading} block>
          Ingresar
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        ¿Querés repartir con EnHora?{' '}
        <Link to="/registro" className="font-semibold text-brand-700 hover:underline">
          Sumate
        </Link>
      </p>
    </Card>
  );
}
