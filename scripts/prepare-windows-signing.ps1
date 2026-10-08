$ErrorActionPreference = 'Stop'

if ($env:WINDOWS_CERT_SHA1 -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid WINDOWS_CERT_SHA1.' }
$certificate = Get-Item "Cert:\CurrentUser\My\$env:WINDOWS_CERT_SHA1"

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
