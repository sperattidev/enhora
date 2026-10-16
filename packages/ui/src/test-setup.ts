import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// MapLibre needs WebGL, which jsdom does not have.
vi.mock('maplibre-gl', () => ({}));
