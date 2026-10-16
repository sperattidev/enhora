import type * as MapLibre from 'maplibre-gl';
// MapLibre locates its worker relative to its own file, which breaks once Vite bundles it:
// let Vite bundle the worker and hand MapLibre the resulting URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Free vector tiles, no API key; attribution is shown by the map itself. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const FIRMAT_CENTER: LatLng = { lat: -33.4594, lng: -61.4832 };

/** Loads MapLibre and its stylesheet on demand, ready to create maps. */
export async function loadMapLibre(): Promise<typeof MapLibre> {
  const [maplibre] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
  maplibre.setWorkerUrl(workerUrl);
  return maplibre;
}
