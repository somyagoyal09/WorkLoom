@echo off
setlocal
cd /d "%~dp0"
python -m pip install -r requirements.txt
python setup_reference_library.py
pause
