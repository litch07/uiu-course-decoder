(async function () {
  "use strict";

  const els = {
    courseCount: document.getElementById("courseCount"),
    currentSite: document.getElementById("currentSite"),
    siteToggle: document.getElementById("siteToggle"),
    toggleLabel: document.getElementById("toggleLabel"),
    statusDot: document.getElementById("statusDot"),
    statusText: document.getElementById("statusText"),
    reloadBtn: document.getElementById("reloadBtn"),
    allowlistInput: document.getElementById("allowlistInput"),
    allowlistBtn: document.getElementById("allowlistBtn"),
    allowlistContainer: document.getElementById("allowlistContainer"),
    courseList: document.getElementById("courseListContainer"),
    modeRadios: document.querySelectorAll('input[name="mode"]')
  };

  const icons = {
    default: `<svg style="width:14px; height:14px; margin-right:4px; vertical-align:middle; fill:white;" viewBox="0 0 24 24"><path d="M12 2v4c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8V2zm1.88 3.88L17.76 9.76l-1.41 1.41L12.46 7.29 8.59 11.17l-1.41-1.41 5.29-5.29 1.41 1.41z"/></svg>`,
    spinner: `<svg style="width:14px; height:14px; margin-right:4px; vertical-align:middle; fill:white; animation: spin 1s linear infinite;" viewBox="0 0 24 24"><path d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8z"/></svg><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>`,
    success: `<svg style="width:14px; height:14px; margin-right:4px; vertical-align:middle; fill:white;" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>`,
    error: `<svg style="width:14px; height:14px; margin-right:4px; vertical-align:middle; fill:white;" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`
  };

  let currentHost = "";
  let courses = {};
  let currentMode = "inline";
  let allowedSites = [];
  let currentTabId = null;

  async function init() {
    await fetchTabInfo();
    await loadStorageData();

    setupUI();
    attachEventListeners();
  }

  async function fetchTabInfo() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentTabId = tab.id;
      try {
        const url = new URL(tab.url);

        if (url.protocol.startsWith('http')) {
          currentHost = url.hostname;
        }
      } catch (e) {
        currentHost = "";
      }
    }
  }

  async function loadStorageData() {
    const stored = await chrome.storage.local.get(["courses", "mode", "allowedSites"]);
    courses = stored.courses || {};
    currentMode = stored.mode || "inline";
    allowedSites = stored.allowedSites || [];
  }

  function setupUI() {

    els.currentSite.textContent = currentHost || "Unsupported page";

    if (!currentHost) {
      els.siteToggle.disabled = true;
      els.toggleLabel.style.opacity = "0.5";
      els.toggleLabel.style.cursor = "not-allowed";
    }

    els.courseCount.textContent = Object.keys(courses).length.toLocaleString();
    updateToggleAndStatus();
    renderAllowlist();
    renderCourseList();

    const activeRadio = Array.from(els.modeRadios).find(r => r.value === currentMode);
    if (activeRadio) activeRadio.checked = true;
  }

  /** Checks if a given hostname matches any allowlist patterns (supports *) */
  function isHostAllowed(host, sites) {
    if (!host) return false;
    return sites.some(pattern => {
      const regexPattern = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
      return new RegExp(regexPattern, "i").test(host);
    });
  }

  function updateToggleAndStatus() {
    const isEnabled = isHostAllowed(currentHost, allowedSites);
    els.siteToggle.checked = isEnabled;

    if (isEnabled) {
      els.statusDot.className = "status-dot active";
      els.statusText.textContent = "Active on this page";
      els.statusText.style.color = "var(--success)";
    } else {
      els.statusDot.className = "status-dot inactive";
      els.statusText.textContent = "Disabled on this site";
      els.statusText.style.color = "var(--text-muted)";
    }
  }

  function renderAllowlist() {
    els.allowlistContainer.innerHTML = "";

    if (allowedSites.length === 0) {
      els.allowlistContainer.innerHTML = `<div style="padding: 8px; text-align: center; color: var(--text-muted); font-size: 0.7rem;">No domains allowed yet.</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    allowedSites.forEach((site) => {
      const div = document.createElement("div");
      div.className = "allowlist-item";

      const span = document.createElement("span");
      span.textContent = site;

      const btn = document.createElement("button");

      btn.innerHTML = `<svg style="width:14px; height:14px; fill:currentColor;" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
      btn.title = `Remove ${site}`;

      btn.addEventListener("click", async () => {
        allowedSites = allowedSites.filter(s => s !== site);
        await chrome.storage.local.set({ allowedSites });
        renderAllowlist();
        updateToggleAndStatus();
      });

      div.appendChild(span);
      div.appendChild(btn);
      fragment.appendChild(div);
    });

    els.allowlistContainer.appendChild(fragment);
  }

  function renderCourseList() {
    els.courseList.innerHTML = "";
    const keys = Object.keys(courses).sort();

    if (keys.length === 0) {
      els.courseList.innerHTML = `
        <div style="text-align: center; padding: 16px 8px; color: var(--text-muted); font-size: 0.75rem;">
          Database is empty.<br/>Click <strong>Reload Courses</strong> below.
        </div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    keys.forEach(code => {
      const div = document.createElement("div");
      div.className = "course-item";

      const spanCode = document.createElement("span");
      spanCode.className = "course-code";
      spanCode.textContent = code;

      const spanName = document.createElement("span");
      spanName.className = "course-name";
      spanName.textContent = courses[code];

      div.appendChild(spanCode);
      div.appendChild(spanName);
      fragment.appendChild(div);
    });

    els.courseList.appendChild(fragment);
  }

  function attachEventListeners() {

    const addSite = async () => {
      const val = els.allowlistInput.value.trim().toLowerCase();
      if (val && !allowedSites.includes(val)) {
        allowedSites.push(val);
        await chrome.storage.local.set({ allowedSites });

        els.allowlistInput.value = "";
        renderAllowlist();
        updateToggleAndStatus();
      }
    };

    els.allowlistBtn.addEventListener("click", addSite);
    els.allowlistInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") addSite();
    });

    els.siteToggle.addEventListener("change", async () => {
      const isEnabled = els.siteToggle.checked;

      if (isEnabled) {
        if (currentHost && !allowedSites.includes(currentHost)) {
          allowedSites.push(currentHost);
        }
      } else {

        allowedSites = allowedSites.filter(h => h !== currentHost);
      }

      await chrome.storage.local.set({ allowedSites });
      renderAllowlist();
      updateToggleAndStatus();

      if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, { type: "TOGGLE_SITE" }).catch(() => {

        });
      }
    });

    els.modeRadios.forEach((radio) => {
      radio.addEventListener("change", async () => {
        const newMode = radio.value;
        await chrome.storage.local.set({ mode: newMode });

        if (currentTabId) {
          chrome.tabs.sendMessage(currentTabId, { type: "MODE_CHANGED" }).catch(() => { });
        }
      });
    });

    els.reloadBtn.addEventListener("click", async () => {
      els.reloadBtn.innerHTML = `${icons.spinner} Reloading Database...`;
      els.reloadBtn.disabled = true;

      try {
        await chrome.runtime.sendMessage({ type: "RELOAD_COURSES" });

        const data = await chrome.storage.local.get("courses");
        courses = data.courses || {};

        const count = Object.keys(courses).length;
        els.courseCount.textContent = count.toLocaleString();

        renderCourseList();

        els.reloadBtn.innerHTML = `${icons.success} Loaded ${count} Courses`;
        els.reloadBtn.style.background = "linear-gradient(135deg, #10b981, #059669)"; // Success Green
      } catch (err) {
        console.error("Course Reload Error:", err);
        els.reloadBtn.innerHTML = `${icons.error} Update Failed`;
        els.reloadBtn.style.background = "linear-gradient(135deg, #ef4444, #dc2626)"; // Error Red
      } finally {

        setTimeout(() => {
          els.reloadBtn.innerHTML = `${icons.default} Reload Courses from File`;
          els.reloadBtn.style.background = "";
          els.reloadBtn.disabled = false;
        }, 2500);
      }
    });
  }

  init();

})();