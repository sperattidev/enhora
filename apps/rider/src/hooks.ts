import { api } from '@enhora/ui';
import { useEffect, useRef, useState } from 'react';
import { shouldSendLocation } from './logic';

export type GpsStatus = 'off' | 'waiting' | 'ok' | 'denied' | 'unavailable';

/**
 * While enabled, watches the device position and reports it to the API at most every
 * LOCATION_INTERVAL_MS. In a PWA this only runs with the app open; background tracking needs the
 * native wrapper planned in the roadmap.
 */
export function useLocationReporter(enabled: boolean): GpsStatus {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  // Only what the device reported; 'waiting' and 'off' are derived below.
  const [reported, setReported] = useState<'ok' | 'denied' | 'unavailable' | null>(null);
  const lastSent = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setReported('ok');
        const now = Date.now();
        if (!shouldSendLocation(lastSent.current, now)) return;
        lastSent.current = now;
        void api('/courier/location', {
          method: 'PUT',
          body: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        }).catch(() => {
          // Retry on the next fix.
          lastSent.current = null;
        });
      },
      (err) => setReported(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      lastSent.current = null;
      setReported(null);
    };
  }, [enabled, supported]);

  if (!enabled) return 'off';
  if (!supported) return 'unavailable';
  return reported ?? 'waiting';
}

/** Keeps the screen on while working, where the browser allows it. */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // Battery saver or an unfocused tab: nothing to do.
      }
    };
    // The lock drops when the app goes to the background; take it again on return.
    const onVisible = () => document.visibilityState === 'visible' && !released && void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [enabled]);
}

/** Current time, refreshed every second, for countdowns. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
