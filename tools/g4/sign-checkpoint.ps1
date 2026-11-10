<#
.SYNOPSIS
  G4 (#638): sign a checkpoint manifest with the owner's TPM-resident P-256 key.

.DESCRIPTION
  Opens an existing, named, non-exportable ECDSA P-256 key in the Microsoft
  Platform Crypto Provider (TPM 2.0), computes SHA-256 over the exact manifest
  bytes, and writes the IEEE P1363 signature (r||s, 64 bytes) from
  ECDsaCng.SignHash. It never creates, imports or exports a key.

  Windows PowerShell 5.1 runs on .NET Framework, whose CngProvider has no
  MicrosoftPlatformCryptoProvider property; the provider is constructed from
  its name, "Microsoft Platform Crypto Provider", which is the same value.

  Called by FailSafe/extension/scripts/lib/g4/signer.cjs (createTpmSigner).

.PARAMETER ManifestPath
  The persisted manifest.json. Its bytes are hashed exactly as stored.
.PARAMETER SignaturePath
  Output path for the 64-byte signature. Written only after self-verification.
.PARAMETER KeyName
  The CNG key container name chosen at enrollment (enroll-tpm-key.ps1).
.PARAMETER CertificatePath
  The committed public certificate (.cer). The signature is verified against
  it before it is written, and the key's public point must match it.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$SignaturePath,
    [Parameter(Mandatory = $true)][string]$CertificatePath,
    [string]$KeyName = 'FailSafe-G4-Ledger-Witness'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Core

$ProviderName = 'Microsoft Platform Crypto Provider'

function Open-WitnessKey([string]$Name) {
    $provider = New-Object System.Security.Cryptography.CngProvider($ProviderName)
    if (-not [System.Security.Cryptography.CngKey]::Exists($Name, $provider)) {
        throw "G4 key '$Name' does not exist in '$ProviderName'. Enrollment requires owner approval."
    }
    $key = [System.Security.Cryptography.CngKey]::Open($Name, $provider)
    if ($key.Algorithm -ne [System.Security.Cryptography.CngAlgorithm]::ECDsaP256) {
        throw "G4 key '$Name' is $($key.Algorithm), not ECDSA P-256."
    }
    if ($key.ExportPolicy -ne [System.Security.Cryptography.CngExportPolicies]::None) {
        throw "G4 key '$Name' is exportable ($($key.ExportPolicy)); refusing to sign."
    }
    return $key
}

function Get-CertificateKey([string]$Path) {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(, [System.IO.File]::ReadAllBytes($Path))
    $pub = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPublicKey($cert)
    if ($null -eq $pub) { throw "Certificate $Path does not carry an ECDSA public key." }
    return $pub
}

$manifest = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $ManifestPath))
$sha = [System.Security.Cryptography.SHA256]::Create()
$digest = $sha.ComputeHash($manifest)

$key = Open-WitnessKey $KeyName
$ecdsa = New-Object System.Security.Cryptography.ECDsaCng($key)
$signature = $ecdsa.SignHash($digest)
if ($signature.Length -ne 64) { throw "Unexpected signature length $($signature.Length) (want 64, IEEE P1363)." }

$certKey = Get-CertificateKey $CertificatePath
if (-not $certKey.VerifyHash($digest, $signature)) {
    throw "Signature does not verify against $CertificatePath; the key and certificate do not match."
}

[System.IO.File]::WriteAllBytes($SignaturePath, $signature)
Write-Output ("signed sha256 {0}" -f (($digest | ForEach-Object { $_.ToString('x2') }) -join ''))
