@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Win or Win - Diagnostico (somente leitura)
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv || python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)
if not exist dados mkdir dados
".venv\Scripts\python.exe" diagnostico_v4.py
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (echo DIAGNOSTICO APROVADO.) else (echo DIAGNOSTICO REPROVADO - codigo %RC%.)
echo Relatorio salvo em dados\diagnostico_ultimo.txt (sem a chave).
pause
exit /b %RC%
