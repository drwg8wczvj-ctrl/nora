import { registerPlugin } from '@capacitor/core';

// Web fallback throws so callers can detect "native unavailable" and fall
// back to their own in-app menu UI — mirrors NativeTabBar.js's pattern,
// except this plugin has no persistent state to no-op through.
const webImpl = {
  show: async () => { throw new Error('native action menu unavailable'); },
};

const NativeActionMenu = registerPlugin('NativeActionMenu', { web: () => webImpl });

export { NativeActionMenu };
