import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.damso.memorylibrary',
  appName: '담소',
  webDir: 'dist',
  backgroundColor: '#191921',
  server: {
    androidScheme: 'https',
  },
}

export default config
