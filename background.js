// background.js — Sets things up when the extension installs and handles the course data

const COURSES_URL = chrome.runtime.getURL("courses.json");

// Grabs the default courses and mixes in any custom ones the user added.
// Custom courses overwrite defaults if the codes match.
async function loadAndStoreCourses() {
  try {
    const response = await fetch(COURSES_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bundled = await response.json();

    const { userCourses } = await chrome.storage.local.get("userCourses");
    const merged = Object.assign({}, bundled, userCourses || {});
    await chrome.storage.local.set({ courses: merged });
  } catch (err) {
    console.error("[CourseDecoder] Failed to load courses.json:", err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await loadAndStoreCourses();

  // Set default settings if it's their first time installing
  const existing = await chrome.storage.local.get(["mode", "allowedSites"]);
  if (!existing.mode)         await chrome.storage.local.set({ mode: "highlight" });
  if (!existing.allowedSites) await chrome.storage.local.set({ allowedSites: [] });
});

// Refresh the course list every time Chrome starts to ensure we're up to date
chrome.runtime.onStartup.addListener(loadAndStoreCourses);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_COURSE_COUNT") {
    chrome.storage.local.get("courses", ({ courses }) => {
      sendResponse({ count: courses ? Object.keys(courses).length : 0 });
    });
    return true; // Keep channel open for async response
  }
  if (message.type === "RELOAD_COURSES") {
    loadAndStoreCourses().then(() => sendResponse({ ok: true }));
    return true;
  }
});
