@echo off
title RL Manager - Environment Diagnostics
powershell -ExecutionPolicy Bypass -File "%~dp0check-env.ps1"
pause
