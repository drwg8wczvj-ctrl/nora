# Application shell

This directory owns only application-wide lifecycle and presentation:

- crash recovery and startup loading states
- authentication gates
- global providers and future route boundaries

Feature behavior belongs under `src/domain` or its feature directory. Shared
browser state belongs in hooks. Large screens should be lazy-loaded so adding a
mobile or specialized workflow does not increase every user's startup bundle.

Phase 4 begins the incremental split of the legacy `App.js` composition root.
The root may coordinate features, but new persistence, synchronization, or
business rules must not be implemented there.
