; ─── 安装前：终止旧进程 + 清理旧安装目录 ───
!macro customInit
  ; 终止所有相关进程（含隧道客户端）
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM 课堂管理系统.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM electron.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM cloudflared.exe /T 2>nul"'
  Sleep 2500
  RMDir /r "$INSTDIR"
!macroend

; ─── 卸载开始前：终止进程 + 数据删除警告 ───
!macro customUnInit
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM 课堂管理系统.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM electron.exe /T 2>nul"'
  nsExec::ExecToLog 'cmd.exe /c "taskkill /F /IM cloudflared.exe /T 2>nul"'
  Sleep 2000
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "卸载将删除所有用户数据（班级、学生、积分、考勤、座位、值日、成长记录等）。$\n$\n请确认你已备份重要数据！$\n$\n是否继续卸载？" IDYES proceed
    Abort
  proceed:
!macroend

; ─── 卸载完成：删除用户数据 ───
!macro customUnInstall
  RMDir /r "$APPDATA\class-management"
  !ifdef ONE_CLICK
    SetSilent normal
  !endif
  MessageBox MB_OK|MB_ICONINFORMATION "软件已卸载，用户数据已清除。"
!macroend
