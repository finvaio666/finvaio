@echo off
REM ============================================================
REM  ARIA - Import an advisor's Excel files into Notion
REM  Reads from:  FA_Data\<Advisor Name>\
REM  Files:       1_Clients_Database.xlsx, 3_Portfolio_Holdings.xlsx,
REM               Insurance_Policies_Template.xlsx, 2_CashFlow_Database.xlsx,
REM               4_Assets_Liabilities.xlsx
REM ============================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo(
echo ===============================================
echo   ARIA Advisor Import
echo ===============================================
echo(

set "ADV="
set /p "ADV=Advisor full name (EXACTLY as in Users, e.g. TAN TIAN YING): "
if "!ADV!"=="" (
  echo No name entered. Exiting.
  pause & exit /b
)

if not exist "FA_Data\!ADV!\" (
  echo(
  echo [ERROR] Folder not found:  FA_Data\!ADV!\
  echo Create it and drop the filled Excel files in there first.
  pause & exit /b
)

echo(
echo Which sections to import?
echo   [blank] = ALL    or type:  clients / portfolio / insurance / assets
echo   (comma-separate for several, e.g.  clients,insurance )
set "ONLY="
set /p "ONLY=Sections: "

set "ADVISOR_NAME=!ADV!"
set "DATA_DIR=FA_Data\!ADV!"
if not "!ONLY!"=="" ( set "IMPORT_ONLY=!ONLY!" ) else ( set "IMPORT_ONLY=" )

echo(
echo ---------- DRY RUN (no changes written) ----------
node scripts\import-from-excel.mjs --dry-run
echo --------------------------------------------------
echo(

set "GO="
set /p "GO=Proceed with the REAL import? (y/n): "
if /i "!GO!"=="y" (
  echo(
  echo Importing for real...
  node scripts\import-from-excel.mjs
  echo(
  echo Done.
) else (
  echo Cancelled - nothing was written.
)

echo(
pause
endlocal
