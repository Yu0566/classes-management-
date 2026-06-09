$WshShell = New-Object -ComObject WScript.Shell
$StartupFolder = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder 'ClassManagement.lnk'

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = 'C:\Users\ad\Desktop\class-management\start-tunnel.vbs'
$Shortcut.WorkingDirectory = 'C:\Users\ad\Desktop\class-management'
$Shortcut.WindowStyle = 7
$Shortcut.Description = 'Class Management Remote Access'
$Shortcut.Save()

Write-Host "OK - Startup shortcut created at: $ShortcutPath"
