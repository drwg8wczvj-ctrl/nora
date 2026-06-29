import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tech.dongar.nora',
  appName: 'Nora',
  webDir: 'build',
  ios: {
    // App Group used to share data between the main app and the widget extension.
    // Must match the group identifier configured in Xcode for both targets.
    preferredContentMode: 'mobile',
  },
  plugins: {
    // Future plugin configs go here
  },
};

export default config;
