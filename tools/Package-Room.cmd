@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-room.ps1" %*
set "roomPackageExit=%errorlevel%"
if not "%roomPackageExit%"=="0" echo Packaging failed. See the message above.
pause
exit /b %roomPackageExit%
