"use strict";
/**
 * G4 (#638, #665): execute, not only parse, the two PowerShell scripts.
 * Windows PowerShell only. No TPM key is created, opened or used: the enrollment
 * script is run without -ConfirmPersistentTpmKey, so it must refuse in its body
 * after parameter binding succeeds; the signer's P-256 test is exercised with
 * ephemeral software keys and stand-in key objects.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..", "..", "..", "..", "..");
const ENROLL = path.join(REPO, "tools", "g4", "enroll-tpm-key.ps1");
const SIGN = path.join(REPO, "tools", "g4", "sign-checkpoint.ps1");
const skip = process.platform !== "win32" ? "Windows PowerShell only" : false;

function ps(args) {
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args], { encoding: "utf8", windowsHide: true });
}

test("enroll-tpm-key.ps1 binds its parameters and refuses in its body without -ConfirmPersistentTpmKey (#665)", { skip }, () => {
  const r = ps(["-File", ENROLL, "-OwnerApprovalRef", "g4 binding test, no key"]);
  const out = `${r.stdout}${r.stderr}`;
  assert.notEqual(r.status, 0, out);
  assert.doesNotMatch(out, /Join-Path|Cannot bind argument/, "parameter binding must not fail");
  assert.match(out, /Refusing: pass -ConfirmPersistentTpmKey/);
});

const P256_PROBE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Core
$ast = [System.Management.Automation.Language.Parser]::ParseFile('${SIGN.replace(/'/g, "''")}', [ref]$null, [ref]$null)
$fn = $ast.Find({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Test-P256Key' }, $true)
. ([scriptblock]::Create($fn.Extent.Text))
function Stub($alg, $group, $size, $curve) {
  $o = [pscustomobject]@{ Algorithm = $alg; AlgorithmGroup = $group; KeySize = $size; Curve = $curve }
  $o | Add-Member -MemberType ScriptMethod -Name GetProperty -Value {
    param($n, $opt)
    if ($null -eq $this.Curve) { throw 'no such property' }
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($this.Curve + [char]0)
    $v = [pscustomobject]@{ Bytes = $bytes }
    $v | Add-Member -MemberType ScriptMethod -Name GetValue -Value { $this.Bytes } -PassThru
  } -PassThru
}
$A = [System.Security.Cryptography.CngAlgorithm]; $G = [System.Security.Cryptography.CngAlgorithmGroup]
$k256 = [System.Security.Cryptography.CngKey]::Create($A::ECDsaP256)
$k384 = [System.Security.Cryptography.CngKey]::Create($A::ECDsaP384)
[ordered]@{
  real_p256 = Test-P256Key $k256
  real_p384 = Test-P256Key $k384
  tpm_style_generic_ecdsa_nistP256 = Test-P256Key (Stub ([System.Security.Cryptography.CngAlgorithm]::new('ECDSA')) $G::ECDsa 256 'nistP256')
  generic_ecdsa_nistP384 = Test-P256Key (Stub ([System.Security.Cryptography.CngAlgorithm]::new('ECDSA')) $G::ECDsa 384 'nistP384')
  generic_ecdsa_256_wrong_curve = Test-P256Key (Stub ([System.Security.Cryptography.CngAlgorithm]::new('ECDSA')) $G::ECDsa 256 'brainpoolP256r1')
  generic_ecdsa_no_curve = Test-P256Key (Stub ([System.Security.Cryptography.CngAlgorithm]::new('ECDSA')) $G::ECDsa 256 $null)
  rsa = Test-P256Key (Stub $A::Rsa $G::Rsa 2048 $null)
} | ConvertTo-Json -Compress
`;

test("sign-checkpoint.ps1 accepts a P-256 key reported as generic ECDSA and refuses every other key (#665)", { skip }, () => {
  const r = ps(["-Command", P256_PROBE]);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.deepEqual(JSON.parse(r.stdout.trim()), {
    real_p256: true,
    real_p384: false,
    tpm_style_generic_ecdsa_nistP256: true,
    generic_ecdsa_nistP384: false,
    generic_ecdsa_256_wrong_curve: false,
    generic_ecdsa_no_curve: false,
    rsa: false,
  });
});
