@echo off
title Chatbot Server Setup
color 0A

echo ===================================================
echo      Chatbot Server Automatic Setup
echo ===================================================
echo.

echo [1/2] Installing dependencies (this may take a minute)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to install dependencies. Do you have Node.js installed?
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Starting Chatbot Server...
echo The server will start on port 5001.
echo Keep this window OPEN.
echo.

npm start
pause
