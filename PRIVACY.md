<p align="center">
  <img src="icons/icon128.png" width="80" height="80" alt="UIU Logo" />
</p>

<h1 align="center">Privacy Policy</h1>

<p align="center">
  <strong>UIU Course Code Decoder is designed with a strict, privacy-first, offline architecture.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Telemetry-Zero-brightgreen?style=flat-square" alt="Zero Telemetry" />
  <img src="https://img.shields.io/badge/Data%20Collection-None-blue?style=flat-square" alt="No Data Collection" />
  <img src="https://img.shields.io/badge/Storage-100%25%20Local-orange?style=flat-square" alt="Local Storage" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" />
</p>

<p align="center">
  This policy outlines how the <strong>UIU Course Code Decoder</strong> browser extension handles your information. The short answer: <strong>We do not collect, store, transmit, or monetize your personal data. Period.</strong>
</p>

---

## 1. Information We Do NOT Collect

- **No Personal Identifiers**: The extension never reads, stores, or transmits your name, student ID, CGPA, grades, or university login credentials.
- **No Browsing History**: The extension does not record, log, or track the websites you visit or your browsing activity.
- **No Analytics or Telemetry**: There are zero tracking pixels, analytics scripts (such as Google Analytics or Mixpanel), or third-party monitoring services embedded in the extension.
- **No Remote Database**: We do not maintain an external server or database to store user profiles or activity logs.

---

## 2. On-Device Processing

All course decoding, prerequisite graph calculations, and schedule planning execute **entirely client-side within your browser**.

### In-Page Schedule Decoding
- When you navigate to an enabled university portal (such as **UCAM** or **eLMS**), the extension scans visible text nodes strictly to match recognized UIU course codes (e.g., `CSE 1111`, `DS 1501`, `BMT 1103`).
- **Input Exclusions**: The extension explicitly ignores form inputs, password fields, textareas, editable elements (`[contenteditable]`), scripts, styles, and hidden DOM nodes.
- **Attendance Graphs**: On UCAM attendance charts, the extension reads chart labels locally to display your attendance statistics alongside course details. No attendance records leave your machine.

---

## 3. Local Extension Storage

All extension preferences, custom courses, and saved exam routines are stored exclusively on your device using the browser's sandboxed storage (`chrome.storage.local`):

| Storage Key | Purpose | Transmitted Externally? |
|:---|:---|:---:|
| `courses` | Active course map derived from bundled and remote catalog data | **No** (Local only) |
| `userCourses` | Custom electives and local course edits saved by you | **No** (Local only) |
| `enrolledCourses` | Personal courses added to your Exam Clash Planner | **No** (Local only) |
| `allowedSites` | List of website domains permitted for course decoding | **No** (Local only) |
| `mode`, `themePreference` | Display mode (Highlight/Tooltip/Inline) and Light/Dark theme preferences | **No** (Local only) |
| `softDeletedCourses` | Courses you moved to Trash | **No** (Local only) |

Your stored data remains in your browser profile and is never synchronized to cloud servers.

---

## 4. Network Communications

The extension is **100% offline-first**. Network activity occurs only during explicit, user-initiated actions:

1. **Manual Catalog Updates**:
   - If you click **Check for updates** in Settings, the extension sends a single HTTPS GET request to GitHub (`raw.githubusercontent.com`) to retrieve the latest public `courses.json`.
   - This request transmits **zero personal information or local customizations**; it simply downloads the community-maintained course catalog.
2. **Community GitHub Drafts**:
   - If you choose **Report a course error** or **Suggest this update**, the extension opens a new tab with a pre-filled GitHub issue URL containing the course code, title, and your proposed corrections.
   - Nothing is submitted automatically; you review and submit the issue yourself using your own GitHub account.

---

## 5. Browser Permissions

The extension requests only the minimum permissions necessary to function:

| Permission | Technical Need |
|:---|:---|
| `storage` | Required to save your display preferences, custom courses, and planner selections locally on your computer. |
| `activeTab` / `scripting` | Required to recognize course codes and insert tooltips on the university webpage you are currently viewing. |
| `tabs` | Required to determine whether the active browser tab matches an enabled university portal. |
| `*://*.uiu.ac.bd/*` | Allows course decoding on official United International University portals (UCAM and eLMS). |
| `https://raw.githubusercontent.com/*` | Allows the extension to check for public curriculum updates when requested. |

---

## 6. Data Deletion & Removal

- **Reset Customizations**: You can clear all local course overrides and restore the factory-bundled catalog at any time via **Settings → Reset catalog changes**.
- **Complete Erasure**: Uninstalling the extension from your browser automatically and permanently deletes all `chrome.storage.local` data from your device.

---

## 7. Policy Updates

Any future revisions to this policy will be documented transparently in this repository. Significant changes will be detailed in the project release notes.

If you have questions regarding this privacy policy, please open an issue on the [GitHub Repository](https://github.com/litch07/uiu-course-decoder).
