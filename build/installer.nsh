; ─── 安装前：终止旧进程 + 清理旧安装目录 ───
!macro customInit
  ; 终止所有相关进程（含隧道客户端）
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM 课堂管理系统.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM electron.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM cloudflared.exe /T 2>nul"'
  Sleep 2500
  RMDir /r "$INSTDIR"
!macroend

; ─── 卸载开始前：终止进程 ───
!macro customUnInit
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM 课堂管理系统.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM electron.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM cloudflared.exe /T 2>nul"'
  Sleep 2000
!macroend

; ─── 卸载完成前：询问是否删除用户数据 ───
!macro customUnInstall
  ; 一键安装包的卸载程序会强制静默模式，这里用 SetSilent normal 恢复界面
  ; !ifdef ONE_CLICK 是编译时常量，由 electron-builder 根据 oneClick 设置自动定义
  !ifdef ONE_CLICK
    SetSilent normal
  !endif
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除所有用户数据？$\n$\n数据包括班级、学生、积分、考勤、座位、值日、扣分记录等所有信息。$\n$\n选择 [是] 将彻底清空，不可恢复。$\n选择 [否] 则保留数据，下次安装后仍可继续使用。" /SD IDNO IDYES deleteData
  Goto skipDelete
  deleteData:
    RMDir /r "$APPDATA\class-management"
  skipDelete:
!macroend
