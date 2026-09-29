param(
  [ValidateSet('self-signed', 'cert-sha1')]
  [string]$Method = 'self-signed'
)

$ErrorActionPreference = 'Stop'
$packages = @(Get-ChildItem out/make -Filter *.msix -Recurse -File)
if ($packages.Count -ne 1) { throw 'Expected exactly one Windows MSIX package.' }
if ($env:WINDOWS_CERT_SHA1 -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid WINDOWS_CERT_SHA1.' }
$certificate = Get-Item "Cert:\CurrentUser\My\$env:WINDOWS_CERT_SHA1"
$signature = Get-AuthenticodeSignature -FilePath $packages[0].FullName
if ($signature.SignerCertificate.Thumbprint -ne $certificate.Thumbprint) {
  throw 'The MSIX was not signed with the configured certificate.'
}
$archive = [IO.Compression.ZipFile]::OpenRead($packages[0].FullName)
try {
  $entry = $archive.GetEntry('AppxManifest.xml')
  if (-not $entry) { throw 'The MSIX has no AppxManifest.xml.' }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
  if ($manifest.Package.Identity.Publisher -cne $certificate.Subject) {
    throw 'The MSIX publisher does not match the signing certificate.'
  }
  $executable = $manifest.Package.Applications.Application.Executable.Replace('\', '/')
  if (-not $archive.GetEntry($executable)) { throw "The MSIX executable is missing: $executable" }
} finally {
  $archive.Dispose()
}

$trustedPath = "Cert:\LocalMachine\TrustedPeople\$($certificate.Thumbprint)"
$importedTrust = $false
try {
  if ($Method -eq 'self-signed' -and -not (Test-Path $trustedPath)) {
    Import-Certificate -FilePath "$env:RUNNER_TEMP/windows-signing-public/snake.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
    $importedTrust = $true
  }
  $signtool = (Resolve-Path node_modules/@electron/windows-sign/vendor/signtool.exe).Path
  & $signtool verify /pa /all /v $packages[0].FullName
  if ($LASTEXITCODE -ne 0) { throw 'Windows package signature verification failed.' }
} finally {
  if ($importedTrust) { Remove-Item $trustedPath -Force }
}

$publicDirectory = Join-Path $env:RUNNER_TEMP 'windows-signing-public'
New-Item $publicDirectory -ItemType Directory -Force | Out-Null
Copy-Item $packages[0].FullName $publicDirectory
