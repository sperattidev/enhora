import { z } from 'zod';

// Validation messages are shown to merchants and couriers: Spanish everywhere, web and API alike.
z.config(z.locales.es());
