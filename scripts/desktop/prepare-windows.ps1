$ErrorActionPreference = 'Stop'

if ($env:WINDOWS_CERT_SHA1 -notmatch '^[A-Fa-f0-9]{40}$') {
  throw 'WINDOWS_CERT_SHA1 must be a 40-character certificate thumbprint.'
}
$certificate = Get-Item "Cert:\CurrentUser\My\$env:WINDOWS_CERT_SHA1"
if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date)) {
  throw 'The Windows signing certificate must be valid and have a private key.'
}
$manifestPath = (Resolve-Path 'build/AppxManifest.xml').Path
[xml]$manifest = Get-Content -Raw -LiteralPath $manifestPath
$manifest.Package.Identity.Publisher = $certificate.Subject
$manifest.Save($manifestPath)
