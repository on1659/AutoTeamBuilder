@echo off
chcp 65001 >nul
echo ================================
echo   팀 랜덤 배정 시스템 시작
echo ================================
echo.

cd /d "%~dp0"

echo [1/3] 의존성 확인 중...
if not exist "node_modules" (
    echo node_modules 폴더가 없습니다. npm install을 실행합니다...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install 실패!
        pause
        exit /b 1
    )
    echo npm install 완료!
) else (
    echo 의존성이 이미 설치되어 있습니다.
)

echo.
echo [2/3] 서버 시작 중...
echo.
echo ================================
echo   서버가 실행되었습니다!
echo   브라우저에서 아래 주소로 접속하세요:
echo.
echo   http://localhost:3000
echo ================================
echo.
echo 종료하려면 Ctrl+C를 누르세요.
echo.

node server.js

pause
