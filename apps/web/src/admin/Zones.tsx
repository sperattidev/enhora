import { Alert, api, Badge, Button, Card, Field, formatMoney, Input, PageTitle, parsePesos } from '@enhora/ui';
import type { LatLng } from '@enhora/ui/map';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type FormEvent } from 'react';
import type { Zone } from './types';
import { draftPolygon } from './zone-geometry';
import { ZoneMap } from './ZoneMap';

const CITY = 'firmat';

export function ZonesPage() {
  const queryClient = useQueryClient();
  const zones = useQuery({
    queryKey: ['admin', 'zones', CITY],
    queryFn: ({ signal }) => api<Zone[]>(`/admin/cities/${CITY}/zones`, { signal }),
  });
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');

  const addPoint = useCallback((p: LatLng) => setDraft((d) => [...d, p]), []);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'zones'] });

  const create = useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>('/admin/zones', { method: 'POST', body }),
    onSuccess: () => {
      invalidate();
      setDrawing(false);
      setDraft([]);
      setName('');
      setFee('');
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<Zone, 'active' | 'feeCents' | 'name'>> }) =>
      api(`/admin/zones/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });

  const polygon = draftPolygon(draft);
  const feeCents = parsePesos(fee);

  function save(e: FormEvent) {
    e.preventDefault();
    if (!polygon || !feeCents || name.trim().length < 2) return;
    create.mutate({ citySlug: CITY, name: name.trim(), feeCents, area: polygon });
  }

  return (
    <>
      <PageTitle
        title="Zonas de Firmat"
        action={
          !drawing && (
            <Button onClick={() => setDrawing(true)} disabled={!zones.isSuccess}>
              Nueva zona
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-2">
          <ZoneMap zones={zones.data ?? []} draft={draft} drawing={drawing} onAddPoint={addPoint} />
          <p className="text-sm text-slate-500">
            {drawing
              ? 'Hacé clic en el mapa para marcar cada esquina de la zona. No puede pisarse con otra zona activa.'
              : 'Cada envío paga la tarifa de la zona más cara entre sus paradas.'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {drawing && (
            <Card>
              <form onSubmit={save} className="flex flex-col gap-3">
                <h2 className="font-semibold">Nueva zona</h2>
                <p className="text-sm text-slate-600">
                  {draft.length === 0
                    ? 'Marcá al menos 3 puntos en el mapa.'
                    : `${draft.length} ${draft.length === 1 ? 'punto' : 'puntos'} marcados.`}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={draft.length === 0}
                    onClick={() => setDraft((d) => d.slice(0, -1))}
                  >
                    Deshacer punto
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={draft.length === 0}
                    onClick={() => setDraft([])}
                  >
                    Borrar
                  </Button>
                </div>
                <Field label="Nombre">
                  {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Centro" />}
                </Field>
                <Field label="Tarifa por envío" hint="En pesos; la cobra el cadete">
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="decimal"
                      value={fee}
                      onChange={(e) => setFee(e.target.value)}
                      placeholder="$ 2.500"
                    />
                  )}
                </Field>
                {create.isError && <Alert tone="danger">{create.error.message}</Alert>}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setDrawing(false);
                      setDraft([]);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={create.isPending}
                    disabled={!polygon || !feeCents || name.trim().length < 2}
                  >
                    Guardar zona
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {zones.isError && <Alert tone="danger">{zones.error.message}</Alert>}
          {update.isError && <Alert tone="danger">{update.error.message}</Alert>}
          {zones.data?.length === 0 && !drawing && (
            <Alert tone="warning">Firmat no tiene zonas: los comercios no pueden cotizar envíos todavía.</Alert>
          )}
          {zones.data?.map((zone) => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              busy={update.isPending && update.variables?.id === zone.id}
              onUpdate={(body) => update.mutate({ id: zone.id, body })}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function ZoneRow({
  zone,
  busy,
  onUpdate,
}: {
  zone: Zone;
  busy: boolean;
  onUpdate: (body: Partial<Pick<Zone, 'active' | 'feeCents'>>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fee, setFee] = useState(String(zone.feeCents / 100));
  const cents = parsePesos(fee);

  return (
    <Card className={zone.active ? '' : 'opacity-70'}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            {zone.name}
            {!zone.active && <Badge tone="neutral">Inactiva</Badge>}
          </p>
          {!editing && <p className="text-lg font-bold">{formatMoney(zone.feeCents)}</p>}
        </div>
        <div className="flex gap-1">
          {!editing && (
            <Button variant="ghost" className="min-h-9 px-2" onClick={() => setEditing(true)}>
              Tarifa
            </Button>
          )}
          <Button
            variant={zone.active ? 'danger' : 'secondary'}
            className="min-h-9 px-3"
            loading={busy}
            onClick={() => onUpdate({ active: !zone.active })}
          >
            {zone.active ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      </div>
      {editing && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (cents) {
              onUpdate({ feeCents: cents });
              setEditing(false);
            }
          }}
        >
          <div className="flex-1">
            <Field label="Nueva tarifa (pesos)">
              {(p) => <Input {...p} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" disabled={!cents}>
            Guardar
          </Button>
        </form>
      )}
    </Card>
  );
}
