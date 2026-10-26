$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run only on a dedicated GitHub Actions Windows runner.' }
$desktop = Split-Path $PSScriptRoot -Parent
$repo = Split-Path $desktop -Parent
$version = (Get-Content (Join-Path $desktop 'package.json') | ConvertFrom-Json).version
$installDir = Join-Path $env:RUNNER_TEMP 'ohanashi-installed'
$previous = Join-Path $repo 'desktop-release/OhanashiMeijin-0.0.9-x64-Setup.exe'
$current = Join-Path $repo "desktop-release/OhanashiMeijin-$version-x64-Setup.exe"
$process = Start-Process -FilePath $previous -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Previous installer failed: $($process.ExitCode)" }
$env:OHANASHI_TEST_EXECUTABLE = Join-Path $installDir 'OhanashiMeijin.exe'
$env:OHANASHI_TEST_INSTALLER = $current
$env:OHANASHI_TEST_INSTALL_DIR = $installDir
node (Join-Path $PSScriptRoot 'electron.js')
if ($LASTEXITCODE -ne 0) { throw 'Installed application / upgrade checks failed.' }
