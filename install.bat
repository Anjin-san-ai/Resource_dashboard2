@echo off
REM Double-click installer for the Resource Dashboard.
REM Runs install.ps1 with an execution-policy bypass so it works even on
REM machines with restrictive PowerShell script policies.
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1" %*
endlocal
pause
