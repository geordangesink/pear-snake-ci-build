$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:WINDOWS_CERT_SHA1 -notmatch '^[A-Fa-f0-9]{40}$') {
  throw 'WINDOWS_CERT_SHA1 must be a 40-character certificate thumbprint.'
}
$certificate = Get-Item "Cert:\CurrentUser\My\$env:WINDOWS_CERT_SHA1"
if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date)) {
  throw 'The Windows signing certificate must be valid and have an accessible private key.'
}
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$sdk = Get-ChildItem $sdkRoot -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Name } -Descending |
  Where-Object { (Test-Path (Join-Path $_.FullName 'x64\makeappx.exe')) -and (Test-Path (Join-Path $_.FullName 'x64\signtool.exe')) } |
  Select-Object -First 1
if (-not $sdk) { throw 'Install the Windows SDK with MakeAppx and SignTool on windows-signer.' }
$makeAppx = Join-Path $sdk.FullName 'x64\makeappx.exe'
$signTool = Join-Path $sdk.FullName 'x64\signtool.exe'
$work = Join-Path $env:RUNNER_TEMP "snake-msix-$([guid]::NewGuid())"
$layout = Join-Path $work 'layout'
$inputPackage = (Resolve-Path 'out/unsigned/Snake.msix').Path
$outputDirectory = New-Item -ItemType Directory -Force 'out/signed'
$outputPackage = Join-Path $outputDirectory.FullName 'Snake.msix'

try {
  node "$PSScriptRoot/../safe-extract.js" $inputPackage $layout
  if ($LASTEXITCODE -ne 0) { throw 'Could not extract the unsigned MSIX safely.' }
  $settings = [System.Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $manifestPath = Join-Path $layout 'AppxManifest.xml'
  $reader = [System.Xml.XmlReader]::Create($manifestPath, $settings)
  $manifest = [System.Xml.XmlDocument]::new()
  $manifest.XmlResolver = $null
  try { $manifest.Load($reader) } finally { $reader.Dispose() }
  if ($manifest.Package.Identity.Name -ne 'Snake') { throw 'Expected the Snake MSIX package.' }
  $manifest.Package.Identity.Publisher = $certificate.Subject
  $manifest.Save($manifestPath)
  foreach ($name in @('AppxSignature.p7x', 'AppxBlockMap.xml', '[Content_Types].xml')) {
    $file = Join-Path $layout $name
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
  }
  & $makeAppx pack /d $layout /p $outputPackage /h SHA256 /o
  if ($LASTEXITCODE -ne 0) { throw 'MakeAppx could not repack the signing manifest.' }
  & $signTool sign /sha1 $env:WINDOWS_CERT_SHA1 /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $outputPackage
  if ($LASTEXITCODE -ne 0) { throw 'SignTool signing failed.' }
  & $signTool verify /pa /v $outputPackage
  if ($LASTEXITCODE -ne 0) { throw 'SignTool signature verification failed.' }
} finally {
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
