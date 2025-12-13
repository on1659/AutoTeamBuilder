@echo off
chcp 65001 >nul
echo ================================
echo   팀 랜덤 배정 시스템 설치
echo ================================
echo.

cd /d "%~dp0"

echo 의존성을 설치합니다...
call npm install

if errorlevel 1 (
    echo.
    echo 설치 실패!
    pause
    exit /b 1
)

echo.
echo ================================
echo   설치 완료!
echo ================================
echo.
echo 이제 start.bat 파일을 실행하세요.
echo.

pause
