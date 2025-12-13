@echo off
echo ================================
echo   포트 3000 사용 프로세스 종료
echo ================================
echo.

echo 3000 포트를 사용하는 프로세스를 찾는 중...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo PID %%a 프로세스를 종료합니다...
    taskkill /PID %%a /F 2>nul
    if errorlevel 1 (
        echo PID %%a 종료 실패 (이미 종료되었거나 권한 부족)
    ) else (
        echo PID %%a 종료 완료!
    )
)

echo.
echo 완료!
echo.
pause
