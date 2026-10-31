$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run only on a dedicated GitHub Actions Windows runner.' }
$desktop = Split-Path $PSScriptRoot -Parent
$repo = Split-Path $desktop -Parent
$version = (Get-Content (Join-Path $desktop 'package.json') | ConvertFrom-Json).version
$installDir = Join-Path $env:RUNNER_TEMP 'ohanashi-installed'
$previous = Join-Path $repo 'desktop-release/OhanashiMeijin-0.0.9-x64-Setup.exe'
$current = Join-Path $repo "desktop-release/Togaki-$version-x64-Setup.exe"
$desktopDir = [Environment]::GetFolderPath('Desktop')
function Entries { Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayIcon -like '*OhanashiMeijin.exe*' -or $_.DisplayIcon -like '*Togaki.exe*' } }
$process = Start-Process -FilePath $previous -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Previous installer failed: $($process.ExitCode)" }
if (-not (Test-Path (Join-Path $desktopDir 'おはなし名人.lnk'))) { throw 'previous version has no desktop shortcut' }
$env:OHANASHI_TEST_EXECUTABLE = Join-Path $installDir 'OhanashiMeijin.exe'
$env:OHANASHI_TEST_INSTALLER = $current
$env:OHANASHI_TEST_INSTALL_DIR = $installDir
node (Join-Path $PSScriptRoot 'electron.js')
if ($LASTEXITCODE -ne 0) { throw 'Installed application / upgrade checks failed.' }
# the old version (the old name おはなし名人 / OhanashiMeijin.exe) was uninstalled: one entry, the new version
$entries = @(Entries)
Write-Host "uninstall entries: $($entries.Count) $($entries.DisplayVersion -join ',')"
if ($entries.Count -ne 1) { throw "expected 1 installed copy, found $($entries.Count)" }
if ($entries[0].DisplayVersion -ne $version) { throw "expected version $version, found $($entries[0].DisplayVersion)" }
if (Test-Path (Join-Path $desktopDir 'おはなし名人.lnk')) { throw 'the old desktop shortcut is still there' }
if (-not (Test-Path (Join-Path $desktopDir 'Togaki.lnk'))) { throw 'no desktop shortcut for Togaki' }
Write-Host 'upgrade test passed'
