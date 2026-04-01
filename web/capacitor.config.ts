import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ignis.app',
  appName: 'Ignis',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
