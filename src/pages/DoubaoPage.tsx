export default function DoubaoPage() {
  return (
    <div className="h-full w-full">
      <webview
        src="https://www.doubao.com/chat/"
        className="w-full h-full"
        style={{ minHeight: '100%' }}
      />
    </div>
  )
}
