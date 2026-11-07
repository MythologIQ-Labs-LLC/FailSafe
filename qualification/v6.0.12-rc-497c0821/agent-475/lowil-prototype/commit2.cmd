@echo b>> a.txt
@"C:\Program Files\Git\cmd\git.exe" add a.txt
@"C:\Program Files\Git\cmd\git.exe" -c user.name=t -c user.email=t@t commit -qm b
@echo git-commit-exit=%ERRORLEVEL%
