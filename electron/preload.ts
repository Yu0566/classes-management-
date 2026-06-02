import { contextBridge, ipcRenderer } from 'electron'

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

  // 通知事件
  onNotifyShow: (callback: (notification: { title: string; message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, notification: { title: string; message: string }) => callback(notification)
    ipcRenderer.on('notify:show', handler)
    return () => ipcRenderer.removeListener('notify:show', handler)
  },

  // 桌面看板便签
  widget: {
    close: () => ipcRenderer.invoke('widget:close'),
    open: () => ipcRenderer.invoke('widget:open'),
    isOpen: () => ipcRenderer.invoke('widget:isOpen'),
    openMain: () => ipcRenderer.invoke('widget:openMain'),
  },

  // 应用信息
  getAppPath: () => ipcRenderer.invoke('app:getPath'),

  // LAN 服务器控制
  lan: {
    start: (port: number) => ipcRenderer.invoke('lan:start', port),
    stop: () => ipcRenderer.invoke('lan:stop'),
    getStatus: () => ipcRenderer.invoke('lan:status'),
  },

  // 通知发送
  notify: {
    send: (title: string, message: string, mode?: string, duration?: number, imagesJson?: string, urgency?: string) =>
      ipcRenderer.invoke('notify:send', title, message, mode, duration, imagesJson, urgency),
  },

  // 应用功能
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall'),

    // 更新事件监听
    onUpdateChecking: (callback: () => void) => {
      ipcRenderer.on('update:checking', callback)
      return () => ipcRenderer.removeListener('update:checking', callback)
    },
    onUpdateAvailable: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: unknown) => callback(info)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onUpdateNotAvailable: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: unknown) => callback(info)
      ipcRenderer.on('update:not-available', handler)
      return () => ipcRenderer.removeListener('update:not-available', handler)
    },
    onDownloadProgress: (callback: (progress: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress)
      ipcRenderer.on('update:download-progress', handler)
      return () => ipcRenderer.removeListener('update:download-progress', handler)
    },
    onUpdateDownloaded: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: unknown) => callback(info)
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    onUpdateError: (callback: (error: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    },
  },
})
