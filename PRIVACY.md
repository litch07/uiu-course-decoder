# Privacy Policy for UIU Course Code Decoder

**Last Updated:** June 2026

This privacy policy explains how the "UIU Course Code Decoder" Chrome extension handles your data. We believe in your right to privacy, which is why we built this extension to be **100% local and private**.

## The Short Version: We Don't Collect Your Data
**UIU Course Code Decoder does not collect, store, share, or transmit any of your personal data.** 

Everything you do with this extension stays entirely on your own device.

## How Your Data is Handled

### 1. 100% Local Storage
All data associated with the extension—including your custom course lists, display mode preferences, and your website allowlist—is stored locally in your browser using Chrome's built-in `chrome.storage.local`. 

- **No Servers:** We do not have databases or servers.
- **No Analytics:** We do not track how you use the extension.
- **No Third Parties:** We do not use cookies, trackers, or third-party services. 
- **No Data Leaves Your Browser:** Absolutely no information is ever sent to the developer or any third party.

### 2. Why We Request Permissions
To make the extension work seamlessly, we require a few specific permissions when you install it. Here is exactly why we need them:

- **`storage`:** Used exclusively to save your course dictionary, display preferences, and website allowlist to your local browser so they remember your settings the next time you open Chrome.
- **`activeTab` / `scripting`:** Allows the extension to interact with the specific webpage you are currently viewing so it can find and decode the course codes.
- **`host_permissions` (`<all_urls>` & `https://docs.google.com/*`):** This is required to read and modify the text (course codes) on the websites you visit, including inside iframes (like embedded Google Sheets). *Note: The extension gives you full control—it only runs on the specific domains you explicitly add to your allowlist.*

## Changes to This Policy
If we ever decide to change this privacy policy, we will update this document directly. Because the extension is fundamentally designed to not collect data, any future updates will simply reflect changes in functionality while maintaining our strict "local-only" privacy commitment. 

Any updates will be reflected in this file on GitHub and on the Chrome Web Store listing.

## Contact Us
If you have any questions, concerns, or feedback regarding this privacy policy, please feel free to reach out!

**Email:** [ssadidahmed01@gmail.com]  
**GitHub:** [https://github.com/litch07/uiu-course-decoder](https://github.com/litch07/uiu-course-decoder)
