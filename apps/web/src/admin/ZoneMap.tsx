import { FIRMAT_CENTER, loadMapLibre, MAP_STYLE_URL, type LatLng } from '@enhora/ui/map';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { Zone } from './types';
import { draftFeatures, zonesBounds, zonesFeatures } from './zone-geometry';

interface ZoneMapProps {
  zones: Zone[];
  draft: LatLng[];
  drawing: boolean;
  onAddPoint: (p: LatLng) => void;
}

/** Shows every zone of the city and, while drawing, lets the admin click the corners of a new one. */
export function ZoneMap({ zones, draft, drawing, onAddPoint }: ZoneMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const drawingRef = useRef(drawing);
  const onAddRef = useRef(onAddPoint);
  const framed = useRef(false);

  useEffect(() => {
    drawingRef.current = drawing;
    onAddRef.current = onAddPoint;
    if (map.current) map.current.getCanvas().style.cursor = drawing ? 'crosshair' : '';
  }, [drawing, onAddPoint]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const maplibre = await loadMapLibre();
        if (cancelled || !container.current) return;
        const m = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          center: [FIRMAT_CENTER.lng, FIRMAT_CENTER.lat],
          zoom: 13,
          attributionControl: { compact: true },
        });
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        m.on('load', () => {
          const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
          m.addSource('zones', { type: 'geojson', data: empty });
          m.addSource('draft', { type: 'geojson', data: empty });
          m.addLayer({
            id: 'zones-fill',
            type: 'fill',
            source: 'zones',
            paint: {
              'fill-color': ['case', ['get', 'active'], '#0d9488', '#94a3b8'],
              'fill-opacity': ['case', ['get', 'active'], 0.18, 0.08],
            },
          });
          m.addLayer({
            id: 'zones-line',
            type: 'line',
            source: 'zones',
            paint: {
              'line-color': ['case', ['get', 'active'], '#0f766e', '#94a3b8'],
              'line-width': 2,
              'line-dasharray': ['case', ['get', 'active'], ['literal', [1]], ['literal', [2, 2]]],
            },
          });
          m.addLayer({
            id: 'zones-label',
            type: 'symbol',
            source: 'zones',
            layout: { 'text-field': ['get', 'name'], 'text-size': 13, 'text-font': ['Noto Sans Bold'] },
            paint: { 'text-color': '#134e4a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
          });
          m.addLayer({
            id: 'draft-fill',
            type: 'fill',
            source: 'draft',
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.25 },
          });
          m.addLayer({
            id: 'draft-line',
            type: 'line',
            source: 'draft',
            filter: ['!=', ['geometry-type'], 'Point'],
            paint: { 'line-color': '#d97706', 'line-width': 2.5 },
          });
          m.addLayer({
            id: 'draft-points',
            type: 'circle',
            source: 'draft',
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
              'circle-radius': 6,
              'circle-color': '#ffffff',
              'circle-stroke-color': '#d97706',
              'circle-stroke-width': 3,
            },
          });
          setReady(true);
        });
        m.on('click', (e) => {
          if (drawingRef.current) onAddRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        });
        map.current = m;
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource('zones') as GeoJSONSource).setData(zonesFeatures(zones));
    // Frame the city's zones the first time they arrive; afterwards the admin controls the view.
    const bounds = zonesBounds(zones);
    if (bounds && !framed.current) {
      map.current.fitBounds(bounds, { padding: 40, duration: 0 });
      framed.current = true;
    }
  }, [ready, zones]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource('draft') as GeoJSONSource).setData(draftFeatures(draft));
  }, [ready, draft]);

  if (failed) return <p className="rounded-xl bg-slate-100 p-4 text-slate-600">No pudimos cargar el mapa.</p>;
  return (
    <div
      ref={container}
      role="application"
      aria-label="Mapa de zonas"
      className="h-[28rem] w-full overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-300"
    />
  );
}
