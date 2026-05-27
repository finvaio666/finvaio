@echo off
chcp 65001 >nul
title ARIA — Excel to Notion Import

:MENU
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║          ARIA — Excel to Notion Import Tool          ║
echo  ║           Bill Morrisons Financial Consulting        ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Excel files are in:  notion-import-templates\
echo.
echo  ┌──────────────────────────────────────────────────────┐
echo  │  [1]  Full Import  (Clients + Portfolio + Insurance) │
echo  │  [2]  Dry Run      (Preview only — no writes)        │
echo  │  [3]  Recalculate AUM only                           │
echo  │  [4]  Open Excel templates folder                    │
echo  │  [5]  Exit                                           │
echo  └──────────────────────────────────────────────────────┘
echo.
set /p CHOICE=  Choose (1-5):

if "%CHOICE%"=="1" goto IMPORT
if "%CHOICE%"=="2" goto DRY_RUN
if "%CHOICE%"=="3" goto RECALC_AUM
if "%CHOICE%"=="4" goto OPEN_FOLDER
if "%CHOICE%"=="5" goto END

echo  Invalid choice. Try again.
timeout /t 2 >nul
goto MENU

:: ── Option 1: Full Import ─────────────────────────────────────────────────
:IMPORT
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║                    Full Import                       ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Reading from:
echo    - notion-import-templates\1_Clients_Database.xlsx
echo    - notion-import-templates\3_Portfolio_Holdings.xlsx
echo    - notion-import-templates\Insurance_Policies_Template.xlsx
echo.
echo  Writing to: Notion (LIVE — changes will be saved)
echo.
set /p CONFIRM=  Proceed? (Y/N):
if /i not "%CONFIRM%"=="Y" goto MENU

echo.
echo  Running import...
echo  ────────────────────────────────────────────────────────
cd /d "%~dp0"
node scripts\import-from-excel.mjs
echo  ────────────────────────────────────────────────────────
echo.
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Import failed. Check the output above for details.
) else (
  echo  [OK] Import completed successfully!
)
echo.
pause
goto MENU

:: ── Option 2: Dry Run ─────────────────────────────────────────────────────
:DRY_RUN
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║              Dry Run (Preview Only)                  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Reads your Excel files and shows what WOULD be imported.
echo  Nothing is written to Notion.
echo.
echo  Running dry run...
echo  ────────────────────────────────────────────────────────
cd /d "%~dp0"
node scripts\import-from-excel.mjs --dry-run
echo  ────────────────────────────────────────────────────────
echo.
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Script failed. Check the output above.
) else (
  echo  [OK] Dry run complete — no changes were made.
)
echo.
pause
goto MENU

:: ── Option 3: Recalculate AUM ─────────────────────────────────────────────
:RECALC_AUM
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║              Recalculate AUM for All Clients         ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Reads portfolio holdings from Notion and updates each
echo  client's AUM (MYR) field. Does not touch Excel files.
echo.
set /p CONFIRM=  Proceed? (Y/N):
if /i not "%CONFIRM%"=="Y" goto MENU

echo.
echo  Recalculating AUM...
echo  ────────────────────────────────────────────────────────
cd /d "%~dp0"
node scripts\recalc-aum.mjs
echo  ────────────────────────────────────────────────────────
echo.
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Recalc failed. Check the output above.
) else (
  echo  [OK] AUM recalculated successfully!
)
echo.
pause
goto MENU

:: ── Option 4: Open folder ─────────────────────────────────────────────────
:OPEN_FOLDER
cd /d "%~dp0"
explorer notion-import-templates
goto MENU

:: ── Exit ──────────────────────────────────────────────────────────────────
:END
cls
echo.
echo  ARIA Import Tool closed. Goodbye!
echo.
timeout /t 2 >nul
exit
