@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Win or Win - Executor DEMO
if not exist ".venv\Scripts\python.exe" (
  echo Criando ambiente Python...
  py -3 -m venv .venv || python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)
".venv\Scripts\python.exe" iniciar_executor.py
pause
