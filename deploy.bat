@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM  deploy.bat  --  stage, commit and push a content update to main.
REM
REM  Usage:  deploy "your commit message"  [--all] [--yes] [--no-build]
REM
REM  Despite the name this deploys nothing itself. Production publishes on a
REM  push to main, through Vercel's git integration, so all this does is get the
REM  commit there. (Until 2026-08-26 a GitHub Pages workflow published a second
REM  origin from the same push; that origin was retired and the workflow deleted.)
REM
REM  !! IT CANNOT PUSH AN ALREADY-COMMITTED CHANGE. Guard 2 exits 0 on a clean
REM     tree ("Nothing to commit"), which is BEFORE the push at the bottom -- so
REM     after merging a branch into main this reports success and pushes
REM     nothing. That is fine for its actual job, staging loose content edits,
REM     but it means a merge deploys with plain `git push`, not with this. Hit
REM     on 2026-08-23 merging the encoding gate.
REM
REM  WHY THE GUARDS EXIST
REM  The original was three unguarded lines: git add . / commit / push. That was
REM  fine while main was the only branch anyone worked on. It stopped being fine
REM  on 2026-08-22, when a second long-lived branch appeared: `git add .` sweeps
REM  up whatever happens to be in the tree, and the script pushes to WHATEVER
REM  BRANCH IS CHECKED OUT. Run from a feature branch mid-edit, it commits that
REM  branch's work-in-progress and pushes it. Nothing warned you.
REM
REM  Four guards, each closing one of those:
REM    1. main only            -- refuses to run anywhere else
REM    2. no blind `git add .` -- stages public/ and docs/ ONLY, and refuses
REM                               outright if anything else is dirty
REM    3. build first          -- npm run build carries three prebuild gates
REM                               (verify:catalogue, verify:signin-return,
REM                               verify:encoding) and any can fail main's
REM                               deploy. Better to find that here than in
REM                               Vercel's log
REM    4. shows and confirms   -- prints exactly what it is about to commit
REM
REM  Escapes, for when a guard is wrong rather than right:
REM    --all       stage everything, including paths outside public/ and docs/
REM    --yes       skip the confirmation prompt (for non-interactive use)
REM    --no-build  skip the build gate
REM
REM  Called by .claude/commands/add-news.md Step 5 as `deploy.bat "msg"`, which
REM  still works unchanged -- if you alter the argument shape, fix that too.
REM  Structural changes orphaning .claude/commands/ is a repeat offence here.
REM ============================================================================

set "MSG="
set "ALLOW_ALL=0"
set "ASSUME_YES=0"
set "SKIP_BUILD=0"

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="--all" set "ALLOW_ALL=1" & shift & goto parse
if /i "%~1"=="--yes" set "ASSUME_YES=1" & shift & goto parse
if /i "%~1"=="--no-build" set "SKIP_BUILD=1" & shift & goto parse
if not defined MSG set "MSG=%~1" & shift & goto parse
echo Error: unexpected argument "%~1"
echo Usage: deploy "your commit message" [--all] [--yes] [--no-build]
exit /b 1
:parsed

if not defined MSG (
    echo Error: Please provide a commit message.
    echo Usage: deploy "your commit message" [--all] [--yes] [--no-build]
    exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo Error: not inside a git repository.
    exit /b 1
)

REM --- Guard 1: main only -----------------------------------------------------
for /f "usebackq delims=" %%B in (`git rev-parse --abbrev-ref HEAD`) do set "BRANCH=%%B"
if /i not "!BRANCH!"=="main" (
    echo Error: deploy.bat only runs on main. You are on "!BRANCH!".
    echo.
    echo   This script pushes to the live site. On a feature branch, use
    echo   explicit git commands instead:
    echo.
    echo     git add ^<paths^>
    echo     git commit -m "message"
    echo     git push -u origin !BRANCH!
    exit /b 1
)

REM A half-finished merge or rebase would be committed as if it were content.
if exist ".git\MERGE_HEAD" (
    echo Error: a merge is in progress. Finish or abort it first.
    exit /b 1
)
if exist ".git\rebase-merge" (
    echo Error: a rebase is in progress. Finish or abort it first.
    exit /b 1
)
if exist ".git\rebase-apply" (
    echo Error: a rebase is in progress. Finish or abort it first.
    exit /b 1
)

REM --- Guard 2: classify what is dirty ---------------------------------------
REM Anything under public/ or docs/ is content and may be committed from here.
REM Everything else -- src/, supabase/, .github/, scripts/, middleware.js and
REM the root config files -- changes how the site BEHAVES rather than what it
REM says, and does not belong in a one-liner that ends in `git push`.
REM !! Two cmd.exe traps here, both found by running this rather than reading it,
REM    and both FAIL SILENTLY -- they produce an empty loop, which this script
REM    would have read as "working tree is clean" and waved through.
REM    1. `--untracked-files=all` returns NOTHING inside for /f backticks; the
REM       `=` breaks cmd's parsing of the command. The short form -uall works.
REM    2. `tokens=*` strips the leading space from porcelain's "XY path" format,
REM       so the ~3 offset below would eat the first character of every path.
REM       `delims=` keeps the line intact.
REM    A path containing a space arrives quoted, so it fails the public//docs/
REM    prefix test and is treated as outside. That is the safe direction.
set "OUTSIDE="
set "COUNT=0"
for /f "usebackq delims=" %%L in (`git status --porcelain -uall`) do (
    set "LINE=%%L"
    set "P=!LINE:~3!"
    set /a COUNT+=1
    if /i not "!P:~0,7!"=="public/" if /i not "!P:~0,5!"=="docs/" set "OUTSIDE=!OUTSIDE! !P!"
)

if "!COUNT!"=="0" (
    echo Nothing to commit -- the working tree is clean.
    exit /b 0
)

if not defined OUTSIDE goto :paths_ok
if "!ALLOW_ALL!"=="1" goto :paths_ok
echo Error: these changed files are outside public/ and docs/.
echo.
for %%F in (!OUTSIDE!) do echo     %%F
echo.
echo   These change behaviour, not content. Commit them deliberately with
echo   git, or re-run with --all if this really is what you meant.
exit /b 1

:paths_ok

REM --- Guard 3: build before pushing -----------------------------------------
REM !! `exit /b 1` from inside these two nested blocks printed the error but
REM    still returned exit code 0 -- so anything checking the exit code would
REM    read a refused push as a successful one. Reproduced, but not worth
REM    isolating further: jumping to a label at top level is well-defined and
REM    sidesteps the whole class. Keep every failure exit OUT of nested blocks.
if "!SKIP_BUILD!"=="1" goto :build_done
echo Running build gates...
call npm run build >nul 2>&1
if errorlevel 1 goto :build_failed
echo Build OK.
echo.
goto :build_done

:build_failed
echo.
echo Error: the build failed. Not pushing.
echo   Re-run `npm run build` to see why. Three prebuild gates can stop it:
echo     verify:catalogue      -- run `npm run build:catalogue`
echo     verify:signin-return  -- the sign-in redirect guard weakened
echo     verify:encoding       -- run `npm run fix:encoding`
exit /b 1

:build_done

REM --- Guard 4: show, then confirm -------------------------------------------
if "!ALLOW_ALL!"=="1" (
    git add -A
) else (
    git add -A -- public docs
)

echo About to commit to main:
echo.
git diff --cached --stat
echo.
echo   Message: !MSG!
echo.

REM Same shape as the build gate above -- the refusal exits from top level, not
REM from inside the nested if. An empty answer (including EOF, when this is run
REM non-interactively without --yes) is a No.
if "!ASSUME_YES!"=="1" goto :confirmed
set "REPLY="
set /p "REPLY=Push this to the live site? [y/N] "
if /i "!REPLY!"=="y" goto :confirmed
echo Aborted. Nothing was committed; your changes are still staged.
exit /b 1

:confirmed

git commit -m "!MSG!"
if errorlevel 1 (
    echo Error: commit failed.
    exit /b 1
)

git push
if errorlevel 1 (
    echo.
    echo Error: push failed -- the commit exists locally but is not on origin.
    echo   If main moved underneath you: git pull --rebase, then git push.
    exit /b 1
)

echo.
echo Deployed successfully: !MSG!
endlocal
