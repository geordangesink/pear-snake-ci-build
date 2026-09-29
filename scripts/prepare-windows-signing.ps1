param(
  [ValidateSet('self-signed', 'cert-sha1')]
  [string]$Method = 'self-signed'
)

$ErrorActionPreference = 'Stop'

if ($Method -eq 'self-signed') {
  $pfx = Join-Path $env:RUNNER_TEMP 'snake-signing.pfx'
  try {
    [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE_BASE64))
    $password = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
    $certificates = @(Import-PfxCertificate -FilePath $pfx -Password $password -CertStoreLocation Cert:\CurrentUser\My)
    $identities = @($certificates | Where-Object HasPrivateKey)
    if ($identities.Count -ne 1) {
      foreach ($identity in $identities) {
        Remove-Item "Cert:\CurrentUser\My\$($identity.Thumbprint)" -DeleteKey
      }
      throw 'The PFX must contain exactly one signing identity.'
    }
    $certificate = $identities[0]
  } finally {
    Remove-Item $pfx -Force -ErrorAction SilentlyContinue
  }
} else {
  if ($env:WINDOWS_CERT_SHA1 -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid WINDOWS_CERT_SHA1.' }
  $certificate = Get-Item "Cert:\CurrentUser\My\$env:WINDOWS_CERT_SHA1"
}

"thumbprint=$($certificate.Thumbprint)" >> $env:GITHUB_OUTPUT
if (-not $certificate.HasPrivateKey) { throw 'The signing certificate has no private key.' }
if ($certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -le (Get-Date)) {
  throw 'The signing certificate is not currently valid.'
}
$usage = $certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' }
if ('1.3.6.1.5.5.7.3.3' -notin $usage.EnhancedKeyUsages.Value) {
  throw 'The certificate must allow code signing.'
}
$package = Get-Content package.json -Raw | ConvertFrom-Json
$product = if ($package.productName) { $package.productName } else { $package.name }
if ($package.name -notmatch '^[A-Za-z0-9.-]{3,50}$') { throw 'Invalid MSIX package name.' }
if ($product -match '[\\/:*?"<>|]') { throw 'Invalid Windows executable name.' }
$manifestPath = (Resolve-Path build/AppxManifest.xml).Path
[xml]$manifest = Get-Content $manifestPath -Raw
$manifest.Package.Identity.SetAttribute('Name', $package.name)
$manifest.Package.Identity.SetAttribute('Publisher', $certificate.Subject)
$manifest.Package.Properties.DisplayName = $product
$manifest.Package.Properties.PublisherDisplayName = $certificate.GetNameInfo('SimpleName', $false)
$manifest.Package.Properties.Description = $package.description
$application = $manifest.Package.Applications.Application
$application.SetAttribute('Executable', "app\$product.exe")
$application.VisualElements.SetAttribute('DisplayName', $product)
$application.VisualElements.SetAttribute('Description', $package.description)
$manifest.Save($manifestPath)

if ($Method -eq 'self-signed') {
  $publicDirectory = Join-Path $env:RUNNER_TEMP 'windows-signing-public'
  New-Item $publicDirectory -ItemType Directory | Out-Null
  $publicCertificate = Join-Path $publicDirectory 'snake.cer'
  Export-Certificate -Cert $certificate -FilePath $publicCertificate | Out-Null
  $fingerprint = (Get-FileHash $publicCertificate -Algorithm SHA256).Hash
  @"
$product uses a self-signed certificate. Install it only if you trust its publisher.
Certificate subject: $($certificate.Subject)
Certificate SHA-256: $fingerprint

Compare this fingerprint with the publisher's separately supplied fingerprint.
Extract this artifact, then open PowerShell as Administrator in its folder:

  Import-Certificate -FilePath .\snake.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople

Close the administrator window. Double-click the .msix to install for your normal user.
Keep this certificate trusted for future builds from the same publisher.
This certificate is not publicly trusted and does not guarantee SmartScreen reputation.
"@ | Set-Content (Join-Path $publicDirectory 'INSTALL.txt')
  @"
### Windows signing certificate

Subject: $($certificate.Subject)

SHA-256: ``$fingerprint``
"@ >> $env:GITHUB_STEP_SUMMARY
}
