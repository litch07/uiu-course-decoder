<p align="center">
  <img src="icons/icon128.png" width="80" height="80" alt="UIU Logo" />
</p>

<h1 align="center">Security Policy</h1>

<p align="center">
  <strong>Security architecture and vulnerability reporting guidelines for UIU Course Code Decoder.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/DOM%20Policy-Zero--innerHTML-brightgreen?style=flat-square" alt="Zero innerHTML" />
  <img src="https://img.shields.io/badge/Sandboxing-Isolated%20Worlds-blue?style=flat-square" alt="Isolated Worlds" />
  <img src="https://img.shields.io/badge/Manifest-V3-success?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" />
</p>

---

## 1. Supported Versions

Security updates are actively applied to the latest major release:

| Version | Supported | Notes |
|:---|:---:|:---|
| **2.0.x** | **Yes** | Active release line (Manifest V3 architecture). |
| `< 2.0.0` | **No** | Legacy releases; users must upgrade to the latest version. |

---

## 2. Security Architecture & Implemented Defenses

UIU Course Code Decoder enforces defense-in-depth principles across all components:

### A. Zero-innerHTML DOM Architecture
- To prevent Cross-Site Scripting (XSS) attacks, the extension strictly prohibits `.innerHTML`, `.outerHTML`, and `.insertAdjacentHTML`.
- All in-page UI elements (hover cards, tooltips, inline labels, attendance summaries) and popup views are constructed programmatically using safe DOM APIs (`document.createElement`, `document.createTextNode`, `node.textContent`, and `Element.setAttribute`).
- Course codes, titles, and prerequisite notes are strictly handled as plain text nodes, preventing script execution even if malicious content were injected into a webpage.

---

### B. Isolated Worlds & Manifest V3 Sandboxing
- Content scripts operate within isolated execution environments ("Isolated Worlds") provided by the browser extension sandbox.
- Content scripts do not share JavaScript execution scope, globals, or variables with host page scripts on university portals, preventing malicious third-party scripts from accessing extension APIs.
- The extension adheres to Manifest V3 requirements: zero remote code execution (`eval` is forbidden), and no remote scripts, CDNs, or external bundles are loaded at runtime.

---

### C. Prerequisite Graph Integrity & Input Validation
- All course catalog records undergo strict schema validation before insertion into storage:
  - Exact uppercase course code normalization prevents colliding dictionary attacks.
  - Prerequisites are validated against a strict Directed Acyclic Graph (DAG) algorithm to guarantee zero circular dependencies (e.g., A → B → A).
  - Credit counts must be finite positive numbers.
  - Exam slots and days are validated against strict whitelist patterns.
- An automated validation suite (`node scripts/validate_catalog.js`) runs on every GitHub Pull Request and commit via GitHub Actions to prevent broken or poisoned records from entering the shared catalog.

---

### D. Memory & Payload Protection
- User-supplied JSON uploads and remote catalog payloads are strictly capped at **2 MiB**.
- Imports exceeding this threshold are immediately rejected to prevent browser memory exhaustion (DoS).
- JSON parsing enforces duplicate-key detection and rejects malformed payloads before applying changes.

---

### E. Zero-Telemetry & Strict Network Boundaries
- The extension does not transmit background telemetry, browsing activity, or student information.
- Outbound network requests are limited to explicit user actions: fetching the public, static `courses.json` from GitHub (`raw.githubusercontent.com`) via HTTPS when the user manually clicks "Check for updates".

---

## 3. Reporting a Vulnerability

We take the security of student tools seriously. If you discover a potential vulnerability or security issue, please follow responsible disclosure guidelines:

### How to Report
1. **GitHub Security Advisory (Preferred)**:
   - Go to the repository's **Security** tab and click **Report a vulnerability** to open a confidential advisory.
2. **Direct Contact**:
   - Alternatively, reach out directly to the maintainer via GitHub: [@litch07](https://github.com/litch07).

### Please Include:
- A clear description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Affected browser(s) and extension version.

### What to Avoid:
- **Do not open public GitHub issues** containing reproducible exploit steps or sensitive data.
- **Do not include personal student data** (such as student IDs, passwords, or personal routine screenshots) in reports.

---

## 4. Response & Remediation Commitment

- **Initial Response**: We aim to acknowledge vulnerability reports within **48 hours**.
- **Fix & Disclosure**: Confirmed vulnerabilities will receive an expedited fix and release. Once a patch is published, a security advisory will credit the reporter (unless anonymity is requested).
