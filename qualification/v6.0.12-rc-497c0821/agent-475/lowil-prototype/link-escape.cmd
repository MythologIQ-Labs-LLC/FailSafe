@echo off
rem #475 falsifier, run at Low IL from the Low-labeled worktree.
echo medium-original> "C:\Users\<user>\AppData\Local\Temp\fs475lowil-XBEL\outside\victim.txt" 2>nul && echo victim-write-at-low=OK || echo victim-write-at-low=DENIED
mklink /J jdir "C:\Users\<user>\AppData\Local\Temp\fs475lowil-XBEL\outside" >nul 2>&1 && echo junction-created=YES || echo junction-created=NO
echo via-junction> jdir\through-junction.txt 2>nul && echo write-through-junction=OK || echo write-through-junction=DENIED
fsutil hardlink create hl.txt "C:\Users\<user>\AppData\Local\Temp\fs475lowil-XBEL\outside\seed.txt" >nul 2>&1 && echo hardlink-created=YES || echo hardlink-created=NO
echo via-hardlink>> hl.txt 2>nul && echo write-through-hardlink=OK || echo write-through-hardlink=DENIED
