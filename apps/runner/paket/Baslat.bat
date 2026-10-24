@echo off
chcp 65001 >nul
title Outreach - Yerel calisan
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurup tekrar deneyin.
  pause
  exit /b 1
)
node calisan.mjs %*
echo.
echo Calisan durdu. Pencereyi kapatabilirsiniz.
pause
