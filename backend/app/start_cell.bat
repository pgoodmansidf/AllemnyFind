@echo off
START /B redis-server
START /B celery -A celery_app worker --loglevel=info --pool=solo