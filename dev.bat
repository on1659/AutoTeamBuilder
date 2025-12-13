@echo off
chcp 65001 >nul
echo ================================
echo   개발 모드 (자동 재시작)
echo ================================
echo.

cd /d "%~dp0"

echo [1/2] 의존성 확인 중...
if not exist "node_modules" (
    echo node_modules 폴더가 없습니다. npm install을 실행합니다...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install 실패!
        pause
        exit /b 1
    )
)

echo.
echo [2/2] 개발 서버 시작 중...
echo.
echo ================================
echo   개발 모드로 실행 중!
echo   파일 수정 시 자동으로 재시작됩니다.
echo.
echo   http://localhost:3000
echo ================================
echo.

call npm run dev

pause
