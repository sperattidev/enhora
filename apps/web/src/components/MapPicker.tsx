import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
// MapLibre locates its worker relative to its own file, which breaks once Vite bundles it:
// let Vite bundle the worker and hand MapLibre the resulting URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Free vector tiles, no API key; attribution is shown by the map itself. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const FIRMAT_CENTER: LatLng = { lat: -33.4594, lng: -61.4832 };

interface MapPickerProps {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  center?: LatLng;
  label: string;
}

/** Tap the map or drag the pin to choose a point. MapLibre loads only when a picker is shown. */
export function MapPicker({ value, onChange, center = FIRMAT_CENTER, label }: MapPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);

  // Map listeners are attached once; they read the latest callback through this ref.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [maplibre] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelled || !container.current) return;
        maplibre.setWorkerUrl(workerUrl);
        const start = value ?? center;
        const m = new maplibre.Map({
          container: container.current,
          style: STYLE_URL,
          center: [start.lng, start.lat],
          zoom: value ? 16 : 14,
          attributionControl: { compact: true },
        });
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        const pin = new maplibre.Marker({ color: '#0f766e', draggable: true });
        const place = (p: LatLng) => {
          pin.setLngLat([p.lng, p.lat]).addTo(m);
          onChangeRef.current(p);
        };
        if (value) pin.setLngLat([value.lng, value.lat]).addTo(m);
        m.on('click', (e) => place({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
        pin.on('dragend', () => {
          const p = pin.getLngLat();
          onChangeRef.current({ lat: p.lat, lng: p.lng });
        });
        map.current = m;
        marker.current = pin;
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; later value changes move the pin below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value || !map.current || !marker.current) return;
    marker.current.setLngLat([value.lng, value.lat]).addTo(map.current);
  }, [value]);

  if (failed) {
    return (
      <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
        No pudimos cargar el mapa. Revisá tu conexión.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        ref={container}
        role="application"
        aria-label={label}
        className="h-56 w-full overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-300"
      />
      <p className="text-xs text-slate-500">
        {value ? 'Podés arrastrar el pin para ajustar.' : 'Tocá el mapa para marcar el lugar exacto.'}
      </p>
    </div>
  );
}
