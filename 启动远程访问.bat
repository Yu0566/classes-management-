@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo   课堂管理系统 - 远程访问启动器
echo ==========================================
echo.
echo 启动后请勿关闭此窗口！
echo 按 Ctrl+C 可停止所有服务。
echo.
node start-tunnel.js
pause
