@echo off
@rem Phase 3F — reproducible Maestro launcher (Windows).
@rem Maestro is installed under %USERPROFILE%\.maestro-dl\maestro (unzipped release).
@rem Usage: qa\native\maestro.bat <maestro args>   e.g.  qa\native\maestro.bat test qa\native\flows\smoke.yaml
setlocal
if "%JAVA_HOME%"=="" set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set MAESTRO_CLI_NO_ANALYTICS=1
set MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
set MAESTRO_HOME=%USERPROFILE%\.maestro-dl\maestro
"%JAVA_HOME%\bin\java.exe" --enable-native-access=ALL-UNNAMED -classpath "%MAESTRO_HOME%\lib\*" maestro.cli.AppKt %*
