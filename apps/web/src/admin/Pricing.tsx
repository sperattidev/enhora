import { quoteJob } from '@enhora/shared';
import { Alert, api, Button, Card, Field, formatMoney, Input, PageTitle, parsePesos, Spinner } from '@enhora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { PricingRules } from './types';

const CITY = 'firmat';

/** What the admin types: pesos and percentages as strings, converted on save. */
interface Draft {
  extraStop: string;
  errand: string;
  surchargePct: string;
  roundTo: string;
  freeWait: string;
  waitPerMinute: string;
}

const toDraft = (r: PricingRules): Draft => ({
  extraStop: String(r.extraStopFeeCents / 100),
  errand: String(r.errandFeeCents / 100),
  surchargePct: String(r.surchargeBps / 100),
  roundTo: String(r.roundToCents / 100),
  freeWait: String(r.freeWaitMinutes),
  waitPerMinute: String(r.waitFeePerMinuteCents / 100),
});

function fromDraft(d: Draft): PricingRules | null {
  const values = {
    extraStopFeeCents: parsePesos(d.extraStop),
    errandFeeCents: parsePesos(d.errand),
    surchargeBps: parsePesos(d.surchargePct.replace('%', '')),
    roundToCents: parsePesos(d.roundTo),
    freeWaitMinutes: Number.parseInt(d.freeWait, 10),
    waitFeePerMinuteCents: parsePesos(d.waitPerMinute),
  };
  if (Object.values(values).some((v) => v === null || Number.isNaN(v))) return null;
  // parsePesos turns "15" into 1500, which is exactly 15 % in basis points.
  return values as PricingRules;
}

export function PricingPage() {
  const query = useQuery({
    queryKey: ['admin', 'pricing', CITY],
    queryFn: ({ signal }) => api<PricingRules>(`/admin/cities/${CITY}/pricing`, { signal }),
  });
  if (query.isPending) {
    return (
      <div className="flex justify-center py-10 text-brand-700">
        <Spinner />
      </div>
    );
  }
  if (query.isError) return <Alert tone="danger">{query.error.message}</Alert>;
  return <PricingForm initial={query.data} />;
}

function PricingForm({ initial }: { initial: PricingRules }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saved, setSaved] = useState(false);
  const rules = fromDraft(draft);
  const save = useMutation({
    mutationFn: (body: PricingRules) => api(`/admin/cities/${CITY}/pricing`, { method: 'PUT', body }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] });
    },
  });

  const set = (key: keyof Draft) => (e: { target: { value: string } }) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (rules) save.mutate(rules);
  }

  // Live example with a $2.500 zone, so the effect of each knob is obvious.
  const example =
    rules &&
    quoteJob(
      [
        { kind: 'PICKUP', zoneId: 'z' },
        { kind: 'DROPOFF', zoneId: 'z' },
        { kind: 'DROPOFF', zoneId: 'z' },
      ],
      {
        zoneFees: { z: 250_000 },
        extraStopFee: rules.extraStopFeeCents,
        errandFee: rules.errandFeeCents,
        surchargeBps: rules.surchargeBps,
        roundToCents: rules.roundToCents,
        freeWaitMinutes: rules.freeWaitMinutes,
        waitFeePerMinute: rules.waitFeePerMinuteCents,
      },
    );

  return (
    <>
      <PageTitle title="Tarifas de Firmat" />
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Parada extra" hint="Desde la tercera parada, en pesos">
              {(p) => <Input {...p} inputMode="decimal" value={draft.extraStop} onChange={set('extraStop')} />}
            </Field>
            <Field label="Trámite o compra" hint="Por cada parada de ese tipo, en pesos">
              {(p) => <Input {...p} inputMode="decimal" value={draft.errand} onChange={set('errand')} />}
            </Field>
            <Field label="Recargo" hint="Lluvia, noche, feriados. En %; 0 para apagarlo">
              {(p) => <Input {...p} inputMode="decimal" value={draft.surchargePct} onChange={set('surchargePct')} />}
            </Field>
            <Field label="Redondear hacia arriba a" hint="En pesos; 0 para no redondear">
              {(p) => <Input {...p} inputMode="decimal" value={draft.roundTo} onChange={set('roundTo')} />}
            </Field>
            <Field label="Minutos de espera sin cargo">
              {(p) => <Input {...p} inputMode="numeric" value={draft.freeWait} onChange={set('freeWait')} />}
            </Field>
            <Field label="Espera por minuto extra" hint="En pesos">
              {(p) => <Input {...p} inputMode="decimal" value={draft.waitPerMinute} onChange={set('waitPerMinute')} />}
            </Field>
          </div>
          {!rules && (
            <div className="mt-4">
              <Alert tone="warning">Revisá los valores: hay alguno que no es un número válido.</Alert>
            </div>
          )}
          {save.isError && (
            <div className="mt-4">
              <Alert tone="danger">{save.error.message}</Alert>
            </div>
          )}
          {saved && (
            <div className="mt-4">
              <Alert tone="success">Tarifas guardadas. Se aplican a los próximos envíos.</Alert>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!rules}>
              Guardar tarifas
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Ejemplo</h2>
          <p className="mt-1 text-sm text-slate-600">Retiro y dos entregas en una zona de {formatMoney(250_000)}.</p>
          {example ? (
            <dl className="mt-3 flex flex-col gap-1 text-sm">
              <Line label="Zona" value={example.base} />
              <Line label="Parada extra" value={example.extraStops} />
              <Line label="Recargo" value={example.surcharge} />
              <Line label="Redondeo" value={example.rounding} />
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatMoney(example.total)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Completá los valores para ver el ejemplo.</p>
          )}
        </Card>
      </form>
    </>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd>{formatMoney(value)}</dd>
    </div>
  );
}
