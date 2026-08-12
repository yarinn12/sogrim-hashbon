param(
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $CertificatePath)) {
  throw "Apple certificate file was not found: $CertificatePath"
}
if ([string]::IsNullOrWhiteSpace($env:APPLE_P12_PASSWORD)) {
  throw "Set APPLE_P12_PASSWORD before exporting the certificate."
}

$root = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $root "build\apple-signing"
$p12Path = Join-Path $outputDirectory "sogrim-hashbon-apple-distribution.p12"
$base64Path = Join-Path $outputDirectory "sogrim-hashbon-apple-distribution.p12.base64.txt"
$before = @(Get-ChildItem Cert:\CurrentUser\My | Select-Object -ExpandProperty Thumbprint)

& certreq.exe -accept -user (Resolve-Path -LiteralPath $CertificatePath) | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Apple's certificate could not be matched with the local private key."
}

$certificate = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object {
    $_.HasPrivateKey -and
    $_.NotAfter -gt (Get-Date) -and
    ($_.Issuer -match "Apple" -or $_.Subject -match "Apple Distribution")
  } |
  Sort-Object NotBefore -Descending |
  Select-Object -First 1

if (-not $certificate) {
  $certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.HasPrivateKey -and $_.Thumbprint -notin $before } |
    Sort-Object NotBefore -Descending |
    Select-Object -First 1
}
if (-not $certificate) {
  throw "No newly installed Apple Distribution certificate with a private key was found."
}

$password = ConvertTo-SecureString $env:APPLE_P12_PASSWORD -AsPlainText -Force
Export-PfxCertificate -Cert $certificate -FilePath $p12Path -Password $password -ChainOption BuildChain | Out-Null
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p12Path))
Set-Content -LiteralPath $base64Path -Value $base64 -Encoding ascii -NoNewline

Write-Output "Encrypted P12 is ready: $p12Path"
Write-Output "GitHub secret value is ready locally: $base64Path"
Write-Output "Use APPSTORE_CERTIFICATES_PASSWORD for the password and APPSTORE_CERTIFICATES_FILE_BASE64 for the Base64 value."
