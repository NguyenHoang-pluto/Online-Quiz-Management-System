@echo off
chcp 65001 >nul
title Khởi động EduExam Pro

echo ========================================================
echo       ĐANG KHỞI ĐỘNG HỆ THỐNG EDUEXAM PRO (NHÓM 08)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Kiểm tra Redis & MySQL...
net start "Redis" >nul 2>&1

echo [2/3] Khởi động Backend API (Cổng 3000)...
start "EduExam - Backend API (Port 3000)" cmd /k "chcp 65001 >nul && title Backend API && cd /d "%~dp0" && npm.cmd run dev:api"

echo [3/3] Khởi động Frontend Web (Cổng 5173)...
start "EduExam - Frontend Web (Port 5173)" cmd /k "chcp 65001 >nul && title Frontend Web && cd /d "%~dp0" && npm.cmd run dev:web"

echo.
echo ========================================================
echo   Hệ thống đang mở trong 2 cửa sổ dòng lệnh riêng biệt!
echo   Vui lòng giữ 2 cửa sổ đó khi đang test hệ thống.
echo.
echo   Đang tự động mở trình duyệt: http://localhost:5173
echo ========================================================
echo.

timeout /t 4 >nul
start http://localhost:5173

pause
