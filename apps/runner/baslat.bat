@echo off
chcp 65001 >nul
title HeAlthFintel calisan
cd /d "%~dp0..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurup bu dosyayi tekrar acin.
  pause
  exit /b 1
)
echo Gerekli paketler hazirlaniyor (ilk acilista birkac dakika surebilir)...
call npx -y pnpm@10.28.0 install --filter "@hfo/runner..." --no-frozen-lockfile
if errorlevel 1 (
  echo Paketler kurulamadi. Internet baglantinizi kontrol edip tekrar deneyin.
  pause
  exit /b 1
)
call npx -y pnpm@10.28.0 --filter @hfo/runner start %*
pause
