@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=C:\Users\A\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "PORT=4180"
taskkill /FI "WINDOWTITLE eq Settle Friends Server" /F >nul 2>nul
start "Settle Friends Server" /min "%NODE%" "%ROOT%server.mjs" %PORT% 0.0.0.0
ping -n 2 127.0.0.1 >nul
start "" "http://127.0.0.1:%PORT%"
endlocal
