import { registerCourierInputSchema, VEHICLES, type Vehicle } from '@enhora/shared';
import { Alert, api, ApiError, Button, Card, Field, Input, normalizeArPhone, Select } from '@enhora/ui';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

const VEHICLE_LABEL: Record<Vehicle, string> = {
  MOTORCYCLE: 'Moto',
  BICYCLE: 'Bicicleta',
  CAR: 'Auto',
  ON_FOOT: 'A pie',
};

const EMPTY = { fullName: '', dni: '', phone: '', email: '', password: '' };

export function RegisterPage() {
  const [form, setForm] = useState(EMPTY);
  const [vehicle, setVehicle] = useState<Vehicle>('MOTORCYCLE');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = registerCourierInputSchema.safeParse({
      ...form,
      vehicle,
      phone: normalizeArPhone(form.phone) ?? form.phone,
      citySlug: 'firmat',
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await api('/auth/register/courier', { method: 'POST', body: parsed.data, auth: false });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        setErrors(Object.fromEntries(err.issues.map((i) => [i.path.split('.')[0]!, i.message])));
      } else {
        setFormError(err instanceof Error ? err.message : 'No pudimos registrarte.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-bold">¡Gracias, {form.fullName.split(' ')[0]}!</h1>
        <p className="text-slate-700">
          Vamos a verificar tu identidad. Te vamos a pedir foto del DNI, licencia, seguro y constancia de monotributo.
          Cuando te aprobemos, vas a poder conectarte y recibir envíos.
        </p>
        <Link
          to="/ingresar"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 font-semibold text-white"
        >
          Ingresar
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-bold">Sumate como cadete</h1>
      <p className="mb-4 text-sm text-slate-600">Cobrás el 100 % de cada envío. Manejás tus horarios.</p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Nombre y apellido" error={errors.fullName}>
          {(p) => <Input {...p} value={form.fullName} onChange={set('fullName')} autoComplete="name" />}
        </Field>
        <Field label="DNI" error={errors.dni}>
          {(p) => <Input {...p} value={form.dni} onChange={set('dni')} inputMode="numeric" />}
        </Field>
        <Field label="Vehículo">
          {(p) => (
            <Select {...p} value={vehicle} onChange={(e) => setVehicle(e.target.value as Vehicle)}>
              {VEHICLES.map((v) => (
                <option key={v} value={v}>
                  {VEHICLE_LABEL[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Celular" hint="Con código de área, por ejemplo 3465 12-3456" error={errors.phone}>
          {(p) => <Input {...p} type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} autoComplete="email" />}
        </Field>
        <Field label="Contraseña" hint="Al menos 10 caracteres" error={errors.password}>
          {(p) => (
            <Input
              {...p}
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
            />
          )}
        </Field>
        <Button type="submit" loading={loading} block>
          Registrarme
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        ¿Ya tenés cuenta?{' '}
        <Link to="/ingresar" className="font-semibold text-brand-700 hover:underline">
          Ingresá
        </Link>
      </p>
    </Card>
  );
}
