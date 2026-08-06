# Nora visual architecture

This directory records the migration contract for the native redesign.

## Cascade ownership

1. `index.css` owns the document reset and installed-app background.
2. `styles/tokens.css` owns the native Nora/Atlas brand, type, spacing,
   geometry, motion, safe-area, and semantic color tokens.
3. `App.css` currently owns the legacy desktop shell and shared planner views.
4. `MobileApp.css` currently owns the legacy mobile shell and mobile-only views.
5. `theme.css` owns the legacy Nora/Atlas persona token switch until those
   screens migrate to `styles/tokens.css`.
6. `glass.css` is legacy and will be retired as screens move to the native system.
7. Component stylesheets own only their component internals.

No new global override stylesheet may be added. New work must replace or migrate
the owning selector in its source stylesheet.

## Migration rules

- Build reusable primitives before migrating screens.
- Remove the old selector when its replacement ships.
- Do not use `!important` except for native-platform integration constraints.
- Avoid backdrop filters on scrolling content.
- Avoid animation on every list/card child.
- Use one dominant action per screen.
- Preserve iOS safe areas and a minimum 44px touch target.
- Nora brand actions use the shared BrandStar component.
- New shared controls come from `components/ui/NativeUI`; screens should not
  create a second local interpretation of the same control.
- Functional actions keep semantic icons.

Run `npm run audit:styles` after every redesign phase to track reduction of the
legacy layers and expensive effects.
