// popup.js — The logic behind the extension's popup UI

(async function () {
  "use strict";

  // Grab all our UI elements upfront
  const els = {
    courseCount: document.getElementById("courseCount"),
    currentSite: document.getElementById("currentSite"),
    siteToggle: document.getElementById("siteToggle"),
    toggleLabel: document.getElementById("toggleLabel"),
    statusDot: document.getElementById("statusDot"),
    statusText: document.getElementById("statusText"),
    reloadBtn: document.getElementById("reloadBtn"),
    openCoursesBtn: document.getElementById("openCoursesBtn"),
    allowlistInput: document.getElementById("allowlistInput"),
    allowlistBtn: document.getElementById("allowlistBtn"),
    allowlistContainer: document.getElementById("allowlistContainer"),
    modeRadios: document.querySelectorAll('input[name="mode"]'),
    viewWrapper: document.getElementById("viewWrapper"),
    backBtn: document.getElementById("backBtn"),
    coursesPanelCount: document.getElementById("coursesPanelCount"),
    courseList: document.getElementById("courseList"),
    courseSearch: document.getElementById("courseSearch"),
    jsonInput: document.getElementById("jsonInput"),
    importBtn: document.getElementById("importBtn"),
    clearBtn: document.getElementById("clearBtn"),
    importMsg: document.getElementById("importMsg"),
  };

  // SVG icons we use for button states
  const icons = {
    default: `<svg style="width:13px;height:13px;fill:white;" viewBox="0 0 24 24"><path d="M12 2v4c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8V2zm1.88 3.88L17.76 9.76l-1.41 1.41L12.46 7.29 8.59 11.17l-1.41-1.41 5.29-5.29 1.41 1.41z"/></svg>`,
    spinner: `<svg style="width:13px;height:13px;fill:white;animation:spin 1s linear infinite;" viewBox="0 0 24 24"><path d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8z"/></svg><style>@keyframes spin{100%{transform:rotate(360deg);}}</style>`,
    success: `<svg style="width:13px;height:13px;fill:white;" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>`,
    error: `<svg style="width:13px;height:13px;fill:white;" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  };

  let currentHost = "";
  let courses = {};
  let userCourses = {};
  let currentMode = "highlight";
  let allowedSites = [];
  let currentTabId = null;
  let searchQuery = "";

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
        if (url.protocol.startsWith("http")) currentHost = url.hostname;
      } catch (_) {
        currentHost = "";
      }
    }
  }

  async function loadStorageData() {
    const stored = await chrome.storage.local.get(["courses", "userCourses", "mode", "allowedSites"]);
    courses = stored.courses || {};
    userCourses = stored.userCourses || {};
    currentMode = stored.mode || "highlight";
    allowedSites = stored.allowedSites || [];
  }

  function setupUI() {
    els.currentSite.textContent = currentHost || "Unsupported page";

    // Disable the site toggle if we're on a non-web page (like chrome://)
    if (!currentHost) {
      els.siteToggle.disabled = true;
      els.toggleLabel.style.opacity = "0.5";
      els.toggleLabel.style.cursor = "not-allowed";
    }

    updateCourseCount();
    updateToggleAndStatus();
    renderAllowlist();

    const activeRadio = Array.from(els.modeRadios).find(r => r.value === currentMode);
    if (activeRadio) activeRadio.checked = true;
  }

  function updateCourseCount() {
    const count = Object.keys(courses).length;
    els.courseCount.textContent = count.toLocaleString();
    els.coursesPanelCount.textContent = `${count.toLocaleString()} courses loaded`;
  }

  // Matches domains with wildcards. Duplicated from content.js so the popup
  // can show the correct active/inactive status instantly!
  function isHostAllowed(host, sites) {
    if (!host) return false;
    return sites.some(pattern => {
      const regex = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
      return new RegExp(regex, "i").test(host);
    });
  }

  function updateToggleAndStatus() {
    const enabled = isHostAllowed(currentHost, allowedSites);
    els.siteToggle.checked = enabled;

    if (enabled) {
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
      els.allowlistContainer.innerHTML =
        `<div style="padding:7px;text-align:center;color:var(--text-muted);font-size:0.7rem;">No domains allowed yet.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    allowedSites.forEach(site => {
      const div = document.createElement("div");
      div.className = "allowlist-item";

      const span = document.createElement("span");
      span.textContent = site;

      const btn = document.createElement("button");
      btn.innerHTML = `<svg style="width:13px;height:13px;fill:currentColor;" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
      btn.title = `Remove ${site}`;
      btn.addEventListener("click", async () => {
        allowedSites = allowedSites.filter(s => s !== site);
        await chrome.storage.local.set({ allowedSites });
        renderAllowlist();
        updateToggleAndStatus();
      });

      div.appendChild(span);
      div.appendChild(btn);
      frag.appendChild(div);
    });

    els.allowlistContainer.appendChild(frag);
  }

  function renderCourseList(filter = "") {
    const lc = filter.toLowerCase().trim();
    const entries = Object.entries(courses)
      .filter(([code, name]) =>
        !lc || code.toLowerCase().includes(lc) || name.toLowerCase().includes(lc)
      )
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (entries.length === 0) {
      els.courseList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${filter ? "🔍" : "📚"}</div>
          ${filter
          ? `No results for "<strong>${escapeHtml(filter)}</strong>"`
          : "No courses loaded yet. Import from JSON below."}
        </div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    entries.forEach(([code, name]) => {
      const row = document.createElement("div");
      row.className = "course-row";

      const codeEl = document.createElement("span");
      codeEl.className = "course-row-code";
      codeEl.textContent = code;

      const nameEl = document.createElement("span");
      nameEl.className = "course-row-name";
      nameEl.textContent = name;

      const delBtn = document.createElement("button");
      delBtn.className = "course-row-del";
      delBtn.title = `Delete ${code}`;
      delBtn.innerHTML = `<svg style="width:13px;height:13px;fill:currentColor;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
      delBtn.addEventListener("click", async () => {
        delete courses[code];
        // Only delete from userCourses if the user added it manually.
        // Bundled courses are just hidden until the next reload!
        if (userCourses[code] !== undefined) {
          delete userCourses[code];
          await chrome.storage.local.set({ courses, userCourses });
        } else {
          await chrome.storage.local.set({ courses });
        }
        updateCourseCount();
        renderCourseList(searchQuery);
        // Reload the active tab so the deleted course disappears from the page!
        if (currentTabId) {
          chrome.tabs.sendMessage(currentTabId, { type: "COURSES_UPDATED" }).catch(() => { });
        }
      });

      row.appendChild(codeEl);
      row.appendChild(nameEl);
      row.appendChild(delBtn);
      frag.appendChild(row);
    });

    els.courseList.innerHTML = "";
    els.courseList.appendChild(frag);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showImportMsg(type, text) {
    els.importMsg.className = `import-msg ${type}`;
    els.importMsg.textContent = text;
    setTimeout(() => { els.importMsg.className = "import-msg"; }, 4000);
  }

  function attachEventListeners() {

    // Panel sliding animations
    els.openCoursesBtn.addEventListener("click", () => {
      renderCourseList(searchQuery);
      els.viewWrapper.classList.add("show-courses");
    });
    els.backBtn.addEventListener("click", () => {
      els.viewWrapper.classList.remove("show-courses");
    });

    els.courseSearch.addEventListener("input", () => {
      searchQuery = els.courseSearch.value;
      renderCourseList(searchQuery);
    });

    // Handle user pasting in a new JSON course list
    els.importBtn.addEventListener("click", async () => {
      const raw = els.jsonInput.value.trim();
      if (!raw) {
        showImportMsg("error", "⚠️ Please paste some JSON first.");
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        showImportMsg("error", "❌ Invalid JSON: " + e.message);
        return;
      }

      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        showImportMsg("error", '❌ JSON must be a flat object: { "CODE": "Name" }');
        return;
      }

      let added = 0;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
          const key = k.trim();
          const val = v.trim();
          courses[key] = val;
          userCourses[key] = val;
          added++;
        }
      }

      if (added === 0) {
        showImportMsg("error", "⚠️ No valid entries found in JSON.");
        return;
      }

      await chrome.storage.local.set({ courses, userCourses });
      updateCourseCount();
      renderCourseList(searchQuery);
      els.jsonInput.value = "";
      showImportMsg("success", `✅ Imported ${added} course${added !== 1 ? "s" : ""}. Saved permanently!`);
      // Reload the active tab to decode the newly added courses instantly
      if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, { type: "COURSES_UPDATED" }).catch(() => { });
      }
    });

    // Wipe all courses clean
    els.clearBtn.addEventListener("click", async () => {
      if (!confirm(`Delete ALL ${Object.keys(courses).length} courses from the database? This cannot be undone.`)) return;
      courses = {};
      userCourses = {};
      await chrome.storage.local.set({ courses, userCourses });
      updateCourseCount();
      renderCourseList(searchQuery);
      showImportMsg("success", "🗑️ All courses cleared.");
      // Reload the active tab to clear the old decodings
      if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, { type: "COURSES_UPDATED" }).catch(() => { });
      }
    });

    // Adding sites to the allowlist
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
    els.allowlistInput.addEventListener("keypress", e => { if (e.key === "Enter") addSite(); });

    // Enable/disable the extension on the current site
    els.siteToggle.addEventListener("change", async () => {
      if (els.siteToggle.checked) {
        if (currentHost && !allowedSites.includes(currentHost)) allowedSites.push(currentHost);
      } else {
        allowedSites = allowedSites.filter(h => h !== currentHost);
      }
      await chrome.storage.local.set({ allowedSites });
      renderAllowlist();
      updateToggleAndStatus();

      // Tell the active tab to reload so changes apply instantly
      if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, { type: "TOGGLE_SITE" }).catch(() => { });
      }
    });

    els.modeRadios.forEach(radio => {
      radio.addEventListener("change", async () => {
        await chrome.storage.local.set({ mode: radio.value });
        if (currentTabId) {
          chrome.tabs.sendMessage(currentTabId, { type: "MODE_CHANGED" }).catch(() => { });
        }
      });
    });

    // Talk to the background script to reload courses from our JSON file
    els.reloadBtn.addEventListener("click", async () => {
      els.reloadBtn.innerHTML = `${icons.spinner} Reloading Database…`;
      els.reloadBtn.disabled = true;

      try {
        await chrome.runtime.sendMessage({ type: "RELOAD_COURSES" });
        const data = await chrome.storage.local.get("courses");
        courses = data.courses || {};
        updateCourseCount();

        const count = Object.keys(courses).length;
        els.reloadBtn.innerHTML = `${icons.success} Loaded ${count} Courses`;
        els.reloadBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        if (currentTabId) {
          chrome.tabs.sendMessage(currentTabId, { type: "COURSES_UPDATED" }).catch(() => { });
        }
      } catch (err) {
        console.error("Course reload failed:", err);
        els.reloadBtn.innerHTML = `${icons.error} Update Failed`;
        els.reloadBtn.style.background = "linear-gradient(135deg, #ef4444, #dc2626)";
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