import { registerPlugin } from '@capacitor/core';

// SF Symbol names that mirror the Lucide icons used in the web nav.
// All symbols are available on iOS 14+ — no iOS 26 requirement.
export const NAV_TABS = [
  { id: 'plan',     label: 'Plan',     sfSymbol: 'calendar'             },
  { id: 'tasks',    label: 'Tasks',    sfSymbol: 'checkmark.circle'     },
  { id: 'notes',    label: 'Notes',    sfSymbol: 'note.text'            },
  { id: 'status',   label: 'Status',   sfSymbol: 'chart.bar.xaxis'      },
  { id: 'settings', label: 'Settings', sfSymbol: 'gearshape'            },
];

// Web fallback: all methods are no-ops so the JS hook runs without errors
// in a browser / PWA context (native features simply don't activate).
const webImpl = {
  setup:         async () => {},
  setActiveTab:  async () => {},
  setAppearance: async () => {},
  show:          async () => {},
  hide:          async () => {},
  addListener:   async () => ({ remove: () => {} }),
};

const NativeTabBar = registerPlugin('NativeTabBar', { web: () => webImpl });

export { NativeTabBar };
