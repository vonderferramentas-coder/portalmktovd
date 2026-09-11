$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$appSource = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'app.js')
$firebaseSource = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'firebase-client.js')
$syncSource = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'calendar-post-sync.js')

$expectations = @(
    @{ Name = 'API de gravacao individual'; Source = $firebaseSource; Pattern = '\bwritePost\b' },
    @{ Name = 'API de exclusao individual'; Source = $firebaseSource; Pattern = '\bdeletePost\b' },
    @{ Name = 'Assinatura em tempo real'; Source = $firebaseSource; Pattern = '\bsubscribeToPosts\b' },
    @{ Name = 'Controle de versao por card'; Source = $firebaseSource; Pattern = '\bexpectedRevision\b' },
    @{ Name = 'Sincronizador usa gravacao individual'; Source = $syncSource; Pattern = '\.writePost\s*\(' },
    @{ Name = 'Sincronizador assina alteracoes remotas'; Source = $syncSource; Pattern = '\.subscribeToPosts\s*\(' },
    @{ Name = 'Aplicativo conecta o sincronizador'; Source = $appSource; Pattern = 'CalendarPostSync\.create\s*\(' }
)

$failures = @()
foreach ($expectation in $expectations) {
    if ($expectation.Source -notmatch $expectation.Pattern) {
        $failures += $expectation.Name
    }
}

if ($failures.Count -gt 0) {
    throw "Sincronizacao concorrente incompleta: $($failures -join '; ')"
}

Write-Output 'PASS: cards independentes, tempo real e revisao por card estao conectados ao aplicativo.'
