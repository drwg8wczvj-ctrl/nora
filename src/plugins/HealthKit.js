import { registerPlugin } from '@capacitor/core';

// Web fallback: every method resolves with an "unavailable" shape rather
// than rejecting, so callers (src/lib/healthKit.js) never need a try/catch
// just to run on web/PWA — HealthKit simply reports nothing there.
const webImpl = {
  isAvailable:             async () => ({ available: false }),
  requestAuthorization:    async () => ({ granted: false }),
  getRequestedStatus:      async ({ categories }) => ({ status: Object.fromEntries(categories.map((c) => [c, false])) }),
  queryCategorySamples:    async () => ({ samples: [] }),
  queryQuantitySamples:    async () => ({ samples: [] }),
  queryQuantityStatistics: async () => ({ value: null }),
  queryWorkouts:           async () => ({ workouts: [] }),
};

const HealthKit = registerPlugin('HealthKit', { web: () => webImpl });

export { HealthKit };
