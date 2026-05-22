/// <reference types="vite/client" />

interface Window {
  electronAPI: {
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
    getAppPath: () => Promise<string>
  }
}
