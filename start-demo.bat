@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "process.exit(require('node:sqlite').DatabaseSync ? 0 : 1)" >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
echo [1/5] Preparing isolated demo configuration...
node server\scripts\prepare-demo.cjs
if errorlevel 1 goto failed
echo [2/5] Installing missing dependencies...
cd /d "%~dp0server"
node "%~dp0scripts\check-deps.cjs" "%~dp0server"
if errorlevel 1 (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
echo [3/5] Building server and creating demo accounts...
call npm run build
if errorlevel 1 goto failed
call npm run seed:demo
if errorlevel 1 goto failed
cd /d "%~dp0client"
node "%~dp0scripts\check-deps.cjs" "%~dp0client"
if errorlevel 1 (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
echo [4/5] Building web app...
call npm run build
if errorlevel 1 goto failed
echo [5/5] Starting http://localhost:3001 ...
cd /d "%~dp0server"
call npm run start:demo
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Node.js 22.13+ or 24 and npm are required.
pause
exit /b 1
:failed
echo Demo startup failed. See the error above.
pause
exit /b 1
