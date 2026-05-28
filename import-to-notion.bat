@echo off
chcp 65001 >nul
title ARIA - Excel to Notion Import

:MENU
cls
echo.
echo  =====================================================
echo    ARIA - Excel to Notion Import Tool
echo    Bill Morrisons Financial Consulting
echo  =====================================================
echo.
echo  Excel files are in:  notion-import-templates\
echo.
echo  STEP 1  [1]  Open Excel templates folder
echo  STEP 2  [2]  Dry Run      (Preview - no writes)
echo  STEP 3  [3]  Full Import  (Clients + Portfolio + Insurance)
echo  STEP 4  [4]  Recalculate AUM only
echo          [5]  Exit
echo.
set /p CHOICE=  Choose (1-5):

if "%CHOICE%"=="1" goto OPEN_FOLDER
if "%CHOICE%"=="2" goto DRY_RUN
if "%CHOICE%"=="3" goto IMPORT
if "%CHOICE%"=="4" goto RECALC_AUM
if "%CHOICE%"=="5" goto END

echo  Invalid choice. Try again.
timeout /t 2 >nul
goto MENU

:: -- Step 1: Open folder ---------------------------------------------------
:OPEN_FOLDER
cd /d "%~dp0"
explorer notion-import-templates
goto MENU

:: -- Step 2: Dry Run -------------------------------------------------------
:DRY_RUN
cls
echo.
echo  =====================================================
echo    STEP 2 - Dry Run (Preview Only)
echo  =====================================================
echo.
echo  Reads your Excel files and shows what WOULD be imported.
echo  Nothing is written to Notion.
echo.
echo  Running dry run...
echo  -----------------------------------------------------
cd /d "%~dp0"
node scripts/import-from-excel.mjs --dry-run
echo  -----------------------------------------------------
echo.
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Script failed. Check the output above.
) else (
  echo  [OK] Dry run complete - no changes were made.
  echo  If everything looks correct, run Step 3 to import.
)
echo.
pause
goto MENU

:: -- Step 3: Full Import ---------------------------------------------------
:IMPORT
cls
echo.
echo  =====================================================
echo    STEP 3 - Full Import (LIVE)
echo  =====================================================
echo.
echo  Reading from:
echo    - notion-import-templates\1_Clients_Database.xlsx
echo    - notion-import-templates\3_Portfolio_Holdings.xlsx
echo    - notion-import-templates\Insurance_Policies_Template.xlsx
echo.
echo  Writing to: Notion (LIVE - changes will be saved)
echo.
set /p CONFIRM=  Proceed? (Y/N):
if /i not "%CONFIRM%"=="Y" goto MENU

echo.
echo  Running import...
echo  -----------------------------------------------------
cd /d "%~dp0"
node scripts/import-from-excel.mjs
echo  -----------------------------------------------------
echo.
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Import failed. Check the output above for details.
) else (
  echo  [OK] Import completed successfully!
  echo  Run Step 4 to recalculate AUM for all clients.
)
echo.
pause
goto MENU

:: -- Step 4: Recalculate AUM -----------------------------------------------
:RECALC_AUM
cls
echo.
echo  =====================================================
echo    STEP 4 - Recalculate AUM for All Clients
echo  =====================================================
echo.
echo  Reads portfolio holdings from Notion and updates each
echo  client's AUM (MYR) field. Does not touch Excel files.
echo.
set /p CONFIRM=  Proceed? (Y/N):
if /i not "%CONFIRM%"=="Y" goto MENU

echo.
echo  Recalculating AUM...
echo  -----------------------------------------------------
cd /d "%~dp0"
node scripts/recalc-aum.mjs
echo  -----------------------------------------------------
echo.
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Recalc failed. Check the output above.
) else (
  echo  [OK] AUM recalculated successfully! All done.
)
echo.
pause
goto MENU

:: -- Exit ------------------------------------------------------------------
:END
cls
echo.
echo  ARIA Import Tool closed. Goodbye!
echo.
timeout /t 2 >nul
exit
