@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Win or Win - Diagnostico (somente leitura)
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv || python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)
if not exist dados mkdir dados
".venv\Scripts\python.exe" diagnostico_v4.py > dados\diagnostico_ultimo.txt 2>&1
type dados\diagnostico_ultimo.txt
echo.
echo Resultado salvo em dados\diagnostico_ultimo.txt (sem a chave).
pause
