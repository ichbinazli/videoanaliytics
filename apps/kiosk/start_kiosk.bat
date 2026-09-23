@echo off
title Video Analitik Launcher

rem Betigin bulundugu klasore gec (kisayoldan calistirildiginda calisma dizini farkli olabilir)
cd /d "%~dp0"

rem Paket kurulu degilse (pip install -e .) src/ klasorunu import yoluna ekle
set PYTHONPATH=%~dp0src;%PYTHONPATH%

echo Video Analitik Kiosk sistemi baslatiliyor...

python -m video_analytics.watchdog

pause
