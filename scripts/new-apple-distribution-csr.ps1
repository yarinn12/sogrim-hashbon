param(
  [string]$CommonName = "Yarin Izhak",
  [string]$EmailAddress = "yarinn12@gmail.com",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $root "build\apple-signing"
$requestPath = Join-Path $outputDirectory "sogrim-hashbon-apple-distribution.csr"
$policyPath = Join-Path $outputDirectory "apple-distribution-request.inf"

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
if ((Test-Path -LiteralPath $requestPath) -and -not $Force) {
  Write-Output "Apple Distribution CSR already exists: $requestPath"
  exit 0
}

$escapedCommonName = $CommonName.Replace('"', '')
$escapedEmail = $EmailAddress.Replace('"', '')
$containerName = "SogrimHashbonAppleDistribution-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$policy = @"
[Version]
Signature="`$Windows NT`$"

[NewRequest]
Subject = "CN=$escapedCommonName, E=$escapedEmail"
FriendlyName = "Sogrim Hashbon Apple Distribution"
KeyContainer = "$containerName"
KeyLength = 2048
KeyAlgorithm = RSA
HashAlgorithm = SHA256
KeySpec = 1
KeyUsage = 0xa0
MachineKeySet = FALSE
Exportable = TRUE
SMIME = FALSE
PrivateKeyArchive = FALSE
UserProtected = FALSE
UseExistingKeySet = FALSE
ProviderName = "Microsoft Enhanced RSA and AES Cryptographic Provider"
ProviderType = 24
RequestType = PKCS10
"@

Set-Content -LiteralPath $policyPath -Value $policy -Encoding ascii
& certreq.exe -new -user $policyPath $requestPath | Out-Host
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $requestPath)) {
  throw "Failed to create the Apple Distribution certificate signing request."
}

Write-Output "Apple Distribution CSR is ready: $requestPath"
Write-Output "The exportable private key remains in the current Windows user certificate store."
