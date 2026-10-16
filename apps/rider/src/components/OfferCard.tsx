import { useState } from 'react';
import { Button, formatMoney, STOP_KIND_LABEL, type CourierOffer } from '@enhora/ui';
import { useNow } from '../hooks';
import { secondsLeft } from '../logic';

interface OfferCardProps {
  offer: CourierOffer;
  accepting: boolean;
  rejecting: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function OfferCard({ offer, accepting, rejecting, onAccept, onReject }: OfferCardProps) {
  const now = useNow(true);
  const left = secondsLeft(offer.expiresAt, now);
  // The bar starts full when the offer appears; the TTL itself is the API's business.
  const [total] = useState(() => Math.max(1, left));
  const cash = offer.stops.reduce((sum, s) => sum + (s.cashToCollectCents ?? 0), 0);

  return (
    <section
      aria-labelledby="offer-title"
      className="overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg ring-1 ring-slate-800"
    >
      <div className="h-1.5 bg-slate-700" aria-hidden="true">
        <div
          className="h-full bg-amber-400 transition-[width] duration-1000 ease-linear"
          style={{ width: `${(left / total) * 100}%` }}
        />
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="offer-title" className="text-sm font-medium text-amber-300">
              Nuevo envío
            </p>
            <p className="text-4xl font-bold tracking-tight">{formatMoney(offer.earningsCents)}</p>
            <p className="mt-1 text-sm text-slate-300">{offer.merchantName}</p>
          </div>
          <p className="text-right" aria-live="polite">
            <span className="block text-3xl font-bold tabular-nums">{left}</span>
            <span className="text-xs text-slate-400">segundos</span>
          </p>
        </div>

        <ol className="mt-4 flex flex-col gap-2">
          {offer.stops.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold">
                {i + 1}
              </span>
              <span>
                <span className="text-slate-400">{STOP_KIND_LABEL[s.kind]} · </span>
                {s.address}
              </span>
            </li>
          ))}
        </ol>

        {cash > 0 && (
          <p className="mt-4 rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-200">
            Cobrás {formatMoney(cash)} en efectivo y se lo rendís al comercio.
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Button variant="dark" onClick={onReject} loading={rejecting} disabled={accepting}>
            Paso
          </Button>
          <Button
            onClick={onAccept}
            loading={accepting}
            disabled={rejecting || left === 0}
            className="col-span-2 min-h-14 text-base"
          >
            Aceptar
          </Button>
        </div>
      </div>
    </section>
  );
}
