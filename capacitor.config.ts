import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mcarrows.drift',
  appName: 'Drift Arrows',
  webDir: 'dist',
  android: {
    backgroundColor: '#f5f2ea',
    allowMixedContent: false,
  },
};

export default config;
