@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Could not find backend .venv.
  echo Activate/create the backend virtual environment first.
  pause
  exit /b 1
)
.venv\Scripts\python.exe reset_workloom_data.py
pause
