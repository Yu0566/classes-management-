import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'normal'
}

type DialogState =
  | { type: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: 'notify'; options: { title?: string; message: string; variant?: 'normal' | 'error' }; resolve: () => void }

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>
  notify: (options: { title?: string; message: string; variant?: 'normal' | 'error' } | string) => Promise<void>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null)

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>(resolve => {
      setState({ type: 'confirm', options: opts, resolve })
    })
  }, [])

  const notify = useCallback((options: { title?: string; message: string; variant?: 'normal' | 'error' } | string) => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise<void>(resolve => {
      setState({ type: 'notify', options: opts, resolve })
    })
  }, [])

  const handleClose = (value?: boolean) => {
    if (state?.type === 'confirm') {
      state.resolve(value ?? false)
    } else if (state?.type === 'notify') {
      state.resolve()
    }
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm, notify }}>
      {children}
      {state && (() => {
        const isError = state.type === 'notify' && state.options.variant === 'error'
        const variant = state.type === 'confirm'
          ? (state.options.variant || 'danger')
          : (isError ? 'error' : 'normal')

        const title = state.options.title || (
          state.type === 'notify'
            ? (isError ? '错误' : '提示')
            : (variant === 'danger' ? '操作确认' : '提示')
        )

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => handleClose(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-96 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 px-6 py-5 border-b border-stone-100">
                {variant === 'danger' || isError ? (
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full ${isError ? 'bg-red-100' : 'bg-red-100'} flex items-center justify-center`}>
                    {isError ? <XCircle size={20} className="text-red-500" /> : <AlertTriangle size={20} className="text-red-500" />}
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <CheckCircle size={20} className="text-primary-600" />
                  </div>
                )}
                <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                  {state.options.message}
                </p>
              </div>
              <div className="px-6 py-4 border-t border-stone-100 flex gap-3 justify-end">
                {state.type === 'confirm' && (
                  <button
                    onClick={() => handleClose(false)}
                    className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                  >
                    {state.options.cancelLabel || '取消'}
                  </button>
                )}
                <button
                  onClick={() => handleClose(state.type === 'confirm' ? true : undefined)}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                    variant === 'danger' || isError
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-primary-500 hover:bg-primary-600'
                  }`}
                >
                  {state.type === 'confirm'
                    ? (state.options.confirmLabel || '确认')
                    : '知道了'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </ConfirmContext.Provider>
  )
}
