@echo off
rem workbench.externalBrowser target for the isolated capture profile: VS Code itself launches this with the
rem Console URL it built. Opens it in the installed Chrome with a disposable profile on the capture display.
echo %date% %time% opened>> "C:\dev\mythologiq\failsafe\_work\v6012-film\rig\iso\ctl\external-open.log"
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\dev\mythologiq\failsafe\_work\v6012-film\rig\chrome-profile" --remote-debugging-port=9346 --no-first-run --no-default-browser-check --disable-search-engine-choice-screen --disable-sync --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,PrivacySandboxSettings4,ChromeWhatsNewUI,SigninInterceptBubble --force-device-scale-factor=1.25 --window-position=3432,0 --window-size=1936,1200 --new-window %*
