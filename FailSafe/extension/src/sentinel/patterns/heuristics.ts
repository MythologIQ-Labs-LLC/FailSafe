import { HeuristicPattern } from '../../shared/types';

export const DEFAULT_PATTERNS: HeuristicPattern[] = [
  // Injection Vulnerabilities
  {
    id: "INJ001",
    name: "SQL Injection Risk",
    category: "injection",
    severity: "critical",
    cwe: "CWE-89",
    pattern: "\\b(execute|query|raw)\\s*\\([^)]*\\+[^)]*\\)",
    description: "Potential SQL injection via string concatenation",
    remediation: "Use parameterized queries",
    falsePositiveRate: 0.2, // Added to match type definition in shared/types
    enabled: true // Added to match type definition
  },
  {
    id: "INJ002",
    name: "Command Injection Risk",
    category: "injection",
    severity: "critical",
    cwe: "CWE-78",
    pattern: "\\b(exec|spawn|system)\\s*\\([^)]*\\$\\{",
    description: "Potential command injection via template literal",
    remediation: "Sanitize inputs, avoid shell execution",
    falsePositiveRate: 0.15,
    enabled: true
  },

  // Secret Detection
  {
    id: "SEC001",
    name: "Hardcoded API Key",
    category: "secrets",
    severity: "critical",
    cwe: "CWE-798",
    pattern: "(api[_-]?key|apikey)\\s*[:=]\\s*[\"'][a-zA-Z0-9]{20,}",
    description: "Potential hardcoded API key",
    remediation: "Use environment variables or secret manager",
    falsePositiveRate: 0.1,
    enabled: true
  },
  {
    id: "SEC002",
    name: "Hardcoded Password",
    category: "secrets",
    severity: "critical",
    cwe: "CWE-798",
    pattern: "(password|passwd|pwd)\\s*[:=]\\s*[\"'][^'\"]{8,}",
    description: "Potential hardcoded password",
    remediation: "Use environment variables or secret manager",
    falsePositiveRate: 0.2,
    enabled: true
  },

  // PII Detection
  {
    id: "PII001",
    name: "Social Security Number",
    category: "pii",
    severity: "high",
    pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b",
    description: "Potential SSN in code",
    remediation: "Remove PII, use tokenization",
    falsePositiveRate: 0.3,
    enabled: true
  },
  {
    id: "PII002",
    name: "Credit Card Number",
    category: "pii",
    severity: "high",
    pattern: "\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b",
    description: "Potential credit card number",
    remediation: "Remove PII, use payment processor tokens",
    falsePositiveRate: 0.2,
    enabled: true
  },

  // Complexity (Heuristic approximation via regex tokens)
  {
    id: "CMP001_HEURISTIC",
    name: "Deeply Nested Logic",
    category: "complexity",
    severity: "medium",
    pattern: "(?:\\{[^{}\\n]*){5}",
    description: "Potential excessive nesting detected (heuristic)",
    remediation: "Refactor into smaller functions",
    falsePositiveRate: 0.3,
    enabled: true
  }
];
