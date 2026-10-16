import { registerMerchantInputSchema } from '@enhora/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { MapPicker, type LatLng } from '@enhora/ui/map';
import { Alert, Button, Card, Field, Input, api, ApiError, normalizeArPhone } from '@enhora/ui';

type Errors = Partial<Record<string, string>>;

const EMPTY = {
  displayName: '',
  legalName: '',
  cuit: '',
  phone: '',
  address: '',
  email: '',
  password: '',
};

export function RegisterPage() {
  const [form, setForm] = useState(EMPTY);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = {
      ...form,
      phone: normalizeArPhone(form.phone) ?? form.phone,
      citySlug: 'firmat',
      location: location ?? undefined,
    };
    // Same schema as the API, so most mistakes are caught before the request.
    const parsed = registerMerchantInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await api('/auth/register/merchant', { method: 'POST', body: parsed.data, auth: false });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        setErrors(Object.fromEntries(err.issues.map((i) => [i.path.split('.')[0]!, i.message])));
      } else {
        setFormError(err instanceof Error ? err.message : 'No pudimos registrar tu comercio.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-bold">¡Listo!</h1>
        <p className="text-slate-700">
          Recibimos los datos de <strong>{form.displayName}</strong>. Vamos a revisarlos y te avisamos cuando tu
          comercio esté aprobado. Mientras tanto ya podés ingresar y cotizar envíos.
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
      <h1 className="mb-1 text-xl font-bold">Registrá tu comercio</h1>
      <p className="mb-4 text-sm text-slate-600">Sin costo de alta. Pagás un abono mensual y cada envío por zona.</p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Nombre del comercio" error={errors.displayName}>
          {(p) => <Input {...p} value={form.displayName} onChange={set('displayName')} autoComplete="organization" />}
        </Field>
        <Field label="Razón social" error={errors.legalName}>
          {(p) => <Input {...p} value={form.legalName} onChange={set('legalName')} />}
        </Field>
        <Field label="CUIT" hint="Con o sin guiones" error={errors.cuit}>
          {(p) => (
            <Input {...p} value={form.cuit} onChange={set('cuit')} inputMode="numeric" placeholder="20-12345678-6" />
          )}
        </Field>
        <Field label="Celular" hint="Con código de área, por ejemplo 3465 12-3456" error={errors.phone}>
          {(p) => <Input {...p} value={form.phone} onChange={set('phone')} type="tel" autoComplete="tel" />}
        </Field>
        <Field label="Dirección del local" error={errors.address}>
          {(p) => <Input {...p} value={form.address} onChange={set('address')} autoComplete="street-address" />}
        </Field>
        <div>
          <MapPicker value={location} onChange={setLocation} label="Ubicación del local en el mapa" />
          {errors.location && <p className="mt-1 text-sm text-red-700">Marcá el local en el mapa</p>}
        </div>
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
          Registrar comercio
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
