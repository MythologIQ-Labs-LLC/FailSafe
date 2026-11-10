<#
.SYNOPSIS
  G4 (#638): create the owner's G4 witness key in the TPM. OWNER ONLY.

.DESCRIPTION
  NOT EXECUTED BY ANY AUTOMATION. Running this script creates a persistent
  key. It may be run only by the repository owner, on the owner's
  workstation, after the owner has approved the enrollment procedure in
  docs/releases/V6_0_13_G4_OWNER_DECISIONS.md.

  What it does:
    1. Refuses unless -OwnerApprovalRef and -ConfirmPersistentTpmKey are given.
    2. Refuses if a key with -KeyName already exists (no silent replacement).
    3. Creates an ECDSA P-256 key in the Microsoft Platform Crypto Provider
       (TPM 2.0), current user, ExportPolicy None (non-exportable), key usage
       Signing only. The private key never leaves the TPM.
    4. Self-signs a certificate for it (DigitalSignature only, not a CA),
       valid from now for -ValidDays days.
    5. Exports ONLY the public certificate (DER .cer) to
       tools/g4/keys/<sha256-of-cert>.cer and prints the fingerprint.

  The exact equivalent commands are documented in
  docs/releases/G4_WITNESS_OPERATIONS.md ("Enrollment").
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OwnerApprovalRef,
    [switch]$ConfirmPersistentTpmKey,
    [string]$KeyName = 'FailSafe-G4-Ledger-Witness',
    [int]$ValidDays = 730,
    [string]$Subject = 'CN=FailSafe G4 Ledger Witness, O=MythologIQ Labs LLC',
    [string]$KeysDir = (Join-Path $PSScriptRoot 'keys')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Core

if (-not $ConfirmPersistentTpmKey) {
    throw 'Refusing: pass -ConfirmPersistentTpmKey. This creates a persistent TPM key (owner approval required).'
}
if ([string]::IsNullOrWhiteSpace($OwnerApprovalRef)) { throw 'Refusing: -OwnerApprovalRef must cite the owner approval.' }

$provider = New-Object System.Security.Cryptography.CngProvider('Microsoft Platform Crypto Provider')
if ([System.Security.Cryptography.CngKey]::Exists($KeyName, $provider)) {
    throw "Refusing: key '$KeyName' already exists. Rotation follows the documented transition procedure."
}

function New-WitnessKey([string]$Name, $Provider) {
    $p = New-Object System.Security.Cryptography.CngKeyCreationParameters
    $p.Provider = $Provider
    $p.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
    $p.KeyUsage = [System.Security.Cryptography.CngKeyUsages]::Signing
    $p.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::None
    return [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::ECDsaP256, $Name, $p)
}

function New-WitnessCertificate($Key, [string]$Dn, [int]$Days) {
    $ecdsa = New-Object System.Security.Cryptography.ECDsaCng($Key)
    $req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest($Dn, $ecdsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
    $ku = [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature
    $req.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509KeyUsageExtension($ku, $true)))
    $req.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension($false, $false, 0, $true)))
    $notBefore = [DateTimeOffset]::UtcNow.AddMinutes(-5)
    return $req.CreateSelfSigned($notBefore, $notBefore.AddDays($Days))
}

$key = New-WitnessKey $KeyName $provider
if ($key.ExportPolicy -ne [System.Security.Cryptography.CngExportPolicies]::None) { throw 'Created key is exportable; aborting.' }
$cert = New-WitnessCertificate $key $Subject $ValidDays
$der = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$fp = ([System.Security.Cryptography.SHA256]::Create().ComputeHash($der) | ForEach-Object { $_.ToString('x2') }) -join ''

New-Item -ItemType Directory -Force -Path $KeysDir | Out-Null
$out = Join-Path $KeysDir "$fp.cer"
[System.IO.File]::WriteAllBytes($out, $der)
Write-Output "key name        : $KeyName (Microsoft Platform Crypto Provider, non-exportable)"
Write-Output "approval        : $OwnerApprovalRef"
Write-Output "valid           : $($cert.NotBefore.ToUniversalTime().ToString('o')) .. $($cert.NotAfter.ToUniversalTime().ToString('o'))"
Write-Output "certificate     : $out"
Write-Output "fingerprint     : $fp"
