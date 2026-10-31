@echo off
setlocal DisableDelayedExpansion
set "UNIGATE_PYTHON=%~dp0.venv\Scripts\python.exe"
if not exist "%UNIGATE_PYTHON%" (
    echo Error: backend virtual environment is missing. Follow README setup instructions. 1>&2
    exit /b 1
)
"%UNIGATE_PYTHON%" "%~dp0manage.py" export_surveys %*
exit /b %errorlevel%
