@echo off
start "Proxy de imagens VONDER" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\product-image-proxy.ps1"
start "Coletor de ofertas FG" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\fg-offer-proxy.ps1"
start "Portal local" /min py -3 -m http.server 8080 --bind 127.0.0.1 --directory "%~dp0."
rem Aguarda o auxiliar realmente responder. Um atraso fixo podia abrir o editor antes dele
rem em computadores mais lentos, deixando a foto apenas na miniatura e fora do post.
for /l %%i in (1,1,12) do (
  powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:8765/health'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" && goto proxy_ready
  timeout /t 1 /nobreak >nul
)
:proxy_ready
for /l %%i in (1,1,12) do (
  powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:8080/'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" && goto portal_ready
  timeout /t 1 /nobreak >nul
)
:portal_ready
start "" "http://localhost:8080/"
