@echo off
rem Abre o Orbion.ai com dois cliques.
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" .
