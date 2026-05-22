import { contextBridge, ipcRenderer } from 'electron'

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 数据库操作代理
  db: {
    query: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:query', sql, params),
    run: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:run', sql, params),
    get: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:get', sql, params),
    transaction: (operations: { sql: string; params?: unknown[] }[]) =>
      ipcRenderer.invoke('db:transaction', operations),
  },

  // 对话框
  dialog: {
    openFile: (options: Record<string, unknown>) =>
      ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options: Record<string, unknown>) =>
      ipcRenderer.invoke('dialog:saveFile', options),
    showMessageBox: (options: Record<string, unknown>) =>
      ipcRenderer.invoke('dialog:showMessageBox', options),
  },

  // 窗口事件
  onAppClosing: (callback: () => void) => {
    ipcRenderer.on('app:closing', callback)
    return () => ipcRenderer.removeListener('app:closing', callback)
  },

  // 应用信息
  getAppPath: () => ipcRenderer.invoke('app:getPath'),
})
