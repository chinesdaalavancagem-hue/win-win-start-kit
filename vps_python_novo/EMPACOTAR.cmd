@echo off
cd /d "%~dp0"
py -3 empacotar.py || python empacotar.py
pause
