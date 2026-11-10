@echo off
rem ============================================================
rem  JMP Planner - demarrage sans Docker (backend API + interface)
rem  Deux fenetres s'ouvrent : une par service. Les laisser ouvertes.
rem  Arret = fermer les fenetres (ou redemarrer le PC).
rem ============================================================
cd /d "%~dp0"

if not exist backend\dist\main.js (
  echo Backend non compile : lancer d'abord "Installer-SansDocker.bat".
  pause
  exit /b 1
)
if not exist frontend\dist\index.html (
  echo Frontend non compile : lancer d'abord "Installer-SansDocker.bat".
  pause
  exit /b 1
)

start "JMP Backend (API :8080)" cmd /k "cd /d "%~dp0backend" && node dist\main.js"
timeout /t 8 /nobreak >nul
start "JMP Frontend (app web :8081)" cmd /k "cd /d "%~dp0frontend" && npx vite preview"

echo.
echo App JMP Planner : http://localhost:8081  (depuis le reseau : http://IP-DE-CE-PC:8081)
echo Ne pas fermer les deux fenetres "JMP ...".
timeout /t 5 /nobreak >nul
