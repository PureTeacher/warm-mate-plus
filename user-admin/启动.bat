@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0\..\backend"
echo ==============================================
echo   暖愈心伴 · 用户数据管理平台
echo   启动后端服务 (FastAPI :8080)
echo   管理后台:  http://127.0.0.1:8080/admin/
echo   用户App:   http://127.0.0.1:8080/
echo   关闭本窗口即可停止服务
echo ==============================================
start "" http://127.0.0.1:8080/admin/
python -m uvicorn main:app --host 0.0.0.0 --port 8080
