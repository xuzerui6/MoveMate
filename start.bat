@echo off
setlocal
cd /d "%~dp0"

echo ======================================
echo   搭个局 - 局域网一键启动
echo ======================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 npm，请先安装 Node.js。
  goto end
)

echo [1/4] 编译后端...
cd /d "%~dp0server"
call npm run build
if errorlevel 1 (
  echo [错误] 后端编译失败，启动已取消。
  goto end
)

echo.
echo [2/4] 打包前端到 server\public ...
cd /d "%~dp0client"
call npm run build
if errorlevel 1 (
  echo [错误] 前端打包失败，启动已取消。
  goto end
)

echo.
echo [3/4] 尝试放行 Windows 防火墙 3001 端口...
netsh advfirewall firewall show rule name="搭个局-3001" >nul 2>nul
if errorlevel 1 (
  netsh advfirewall firewall add rule name="搭个局-3001" dir=in action=allow protocol=TCP localport=3001 >nul 2>nul
  if errorlevel 1 (
    echo [提示] 防火墙规则未自动添加成功。
    echo [提示] 如果队友无法访问，请用管理员身份运行本脚本一次。
  ) else (
    echo [完成] 已添加 3001 端口放行规则。
  )
) else (
  echo [完成] 防火墙规则已存在。
)

echo.
echo [4/4] 启动服务...
echo [提示] 启动后会显示局域网访问地址，队友访问那个地址即可。
echo.
cd /d "%~dp0server"
node dist/app.js

:end
echo.
pause
