import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.classmanagement.app',
  appName: '课堂管理系统',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
}

export default config
