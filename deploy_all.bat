@echo off
setlocal

echo [WebFPS] Running tests...
call npm.cmd test
if errorlevel 1 exit /b 1

echo [WebFPS] Building client...
call npm.cmd run build:client
if errorlevel 1 exit /b 1

echo [WebFPS] Checking Cloudflare Worker...
call npm.cmd run worker:check
if errorlevel 1 exit /b 1

echo [WebFPS] Deploying Firebase Hosting...
call npm.cmd run deploy:firebase
if errorlevel 1 exit /b 1

echo [WebFPS] Deploying Cloudflare Worker...
call npm.cmd run deploy:cloudflare
if errorlevel 1 exit /b 1

echo [WebFPS] Deploy complete.
endlocal
