@echo off
setlocal
cd /d "%~dp0"
python tools\update_cardex.py
echo Starting CardForge on http://localhost:8080/game/
start "" http://localhost:8080/game/
python -m http.server 8080
endlocal
