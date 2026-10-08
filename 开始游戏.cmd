@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-room.ps1" %*
set "GAME_EXIT_CODE=%ERRORLEVEL%"
if not "%GAME_EXIT_CODE%"=="0" pause
exit /b %GAME_EXIT_CODE%
