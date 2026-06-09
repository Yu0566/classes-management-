/// <reference types="vite/client" />

interface UpdateInfo {
  version: string
  releaseNotes?: string
  releaseDate?: string
}

interface ProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

interface Window {
  electronAPI?: {
    db: {
      query: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: string }>
      run: (sql: string, params?: unknown[]) => Promise<{ success: boolean; changes: number; error?: string }>
      get: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: string }>
      transaction: (ops: { sql: string; params?: unknown[] }[]) => Promise<{ success: boolean; error?: string }>
    }
    dialog: {
      openFile: (options: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }>
      saveFile: (options: Record<string, unknown>) => Promise<{ canceled: boolean; filePath: string }>
      showMessageBox: (options: Record<string, unknown>) => Promise<{ response: number }>
    }
    onAppClosing: (callback: () => void) => () => void
    onDataChanged: (callback: () => void) => () => void
    onNotifyShow: (callback: (notification: { title: string; message: string }) => void) => () => void
    getAppPath: () => Promise<string>
    lan: {
      start: (port: number) => Promise<{ success: boolean; ip?: string; port?: number; error?: string }>
      stop: () => Promise<{ success: boolean }>
      getStatus: () => Promise<{ running: boolean; ip: string; port: number; mode: string }>
      setDeviceName: (name: string) => Promise<{ success: boolean }>
    }
    tunnel: {
      start: (port: number) => Promise<{ success: boolean; error?: string }>
      stop: () => Promise<{ success: boolean }>
      getStatus: () => Promise<{ status: string; url: string; error?: string }>
      onStatusChange: (callback: (state: { status: string; url: string; error?: string }) => void) => () => void
    }
    notify: {
      send: (title: string, message: string, mode?: 'fullscreen' | 'top', duration?: number, imagesJson?: string, urgency?: '普通' | '重要' | '紧急') => Promise<{ success: boolean; error?: string }>
    }
    widget: {
      close: () => Promise<{ success: boolean }>
      open: () => Promise<{ success: boolean }>
      isOpen: () => Promise<{ open: boolean }>
      openMain: () => Promise<{ success: boolean }>
      refresh: () => Promise<{ success: boolean }>
      onRefresh: (callback: () => void) => () => void
    }
    app: {
      getVersion: () => Promise<string>
      openExternal: (url: string) => Promise<void>
      checkUpdate: () => Promise<{ success: boolean; error?: string }>
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>
      quitAndInstall: () => Promise<{ success: boolean }>
      onUpdateChecking: (callback: () => void) => () => void
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
      onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => () => void
      onDownloadProgress: (callback: (progress: ProgressInfo) => void) => () => void
      onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
      onUpdateError: (callback: (error: string) => void) => () => void
    }
  }
}
