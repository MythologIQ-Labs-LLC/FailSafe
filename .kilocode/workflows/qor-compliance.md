---
name: ql-compliance
description: >
  Guardian of Physical Isolation
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-compliance
description: /qor-compliance - Repository Packaging & Isolation Audit
---

# /qor-compliance - Guardian of Physical Isolation

<skill>
  <trigger>/qor-compliance</trigger>
  <phase>ANY</phase>
  <persona>Judge</persona>
  <output>Compliance report with PASS/FAIL status for Isolation and Constraints</output>
</skill>

## Purpose

Enforces the **Physical Isolation Boundary** and **Platform Metadata Constraints** to ensure the repository is compliant with the workspace architecture and ready for deployment across environments.

## Execution Protocol

### Step 1: Execute Automated Validation

Run the validation script from the application build directory (as defined in `.failsafe/workspace-config.json`):

```powershell
# Example: Running the validator
powershell "[AppContainerPath]/build/validate.ps1"
```

### Step 2: Analyze Results

1.  **Isolation Check**:
    - Verify that application source code is contained within the designated "App Container".
    - Ensure NO development or build folders exist at the repository root.
2.  **Antigravity Constraints**:
    - Confirm all `.md` files in the Gemini-targeting directory have `description` fields â‰¤ 250 characters.
3.  **Prompt Constraints**:
    - Ensure prompt directories follow the required structure (e.g., flat prompts for VSCode).
    - Confirm all workflows use the correct environment-specific extensions (e.g., `.prompt.md`).
4.  **Security Audit**:
    - Verify that sensitive tokens and credentials exist and are NOT tracked by git.

### Step 3: Reporting

Generate a technical compliance report:

```markdown
## âš–ï¸ Compliance Audit

| Domain                   | Status      | Details                             |
| ------------------------ | ----------- | ----------------------------------- |
| **Physical Isolation**   | [PASS/FAIL] | [App code containerized]            |
| **Antigravity Metadata** | [PASS/FAIL] | [Workflow descriptions â‰¤ 250 chars] |
| **Prompt Structure**     | [PASS/FAIL] | [Standardized prompt directories]   |
| **Security Hygiene**     | [PASS/FAIL] | [Marketplace tokens secured]        |
| **Chain Integrity**      | [PASS/FAIL] | [Substantiation status]             |

**Verdict**: [COMPLIANT / VIOLATION DETECTED]
```

## Next Step

| Verdict | Successor |
|---------|-----------|
| COMPLIANT | Continue current phase |
| VIOLATION DETECTED | `/qor-organize` to restructure, or fix manually and re-run `/qor-compliance` |

## Constraints

- **ALWAYS** run the validation checks first.
- **NEVER** move files back to the root if they fail; fix them in the application container.
- **ALWAYS** check Git status to ensure sensitive files are ignored.

---

_Reference: .failsafe/workspace-config.json_


