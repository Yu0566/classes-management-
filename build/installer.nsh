!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除所有用户数据？$\n$\n数据包括班级、学生、积分、考勤、座位、值日等所有信息。$\n$\n如果不删除，下次安装时数据仍会保留。" /SD IDNO IDYES deleteData
  Goto skipDelete
  deleteData:
    RMDir /r "$APPDATA\class-management"
  skipDelete:
!macroend
