@echo off
rem ============================================================
rem  JMP Planner - installation sans Docker (PC de l'entreprise)
rem  A lancer une seule fois, apres avoir copie le projet ici.
rem  Preconditions : Node.js 20+ et MySQL 8 installs, backend\.env cree.
rem ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe. Installer Node 20 LTS depuis nodejs.org.
  pause
  exit /b 1
)

echo [1/4] Installation des dependances du backend...
pushd backend
call npm install
echo [2/4] Compilation du backend...
call npm run build
popd

echo [3/4] Installation des dependances du frontend...
pushd frontend
call npm install
echo [4/4] Compilation du frontend (build de prod dans dist)...
call npm run build
popd

if not exist backend\.env (
  echo.
  echo [ATTENTION] backend\.env absent : copier backend\.env.example en backend\.env
  echo             puis renseurer MYSQL_PASSWORD, JWT_SECRET et JMP_ADMIN_PASSWORD.
)

echo.
echo Installation terminee. Lancer "Demarrer-JMP.bat" puis ouvrir http://localhost:8081
pause
