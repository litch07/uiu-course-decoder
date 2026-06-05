const COURSES_URL = chrome.runtime.getURL("courses.json");

async function loadAndStoreCourses() {
  try {
    const response = await fetch(COURSES_URL);
    if (!response.ok) throw new Error(`Failed to fetch courses.json: ${response.status}`);
    const courses = await response.json();
    await chrome.storage.local.set({ courses });
    console.log(`[CourseDecoder] Loaded ${Object.keys(courses).length} courses into storage.`);
  } catch (err) {
    console.error("[CourseDecoder] Error loading courses.json:", err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await loadAndStoreCourses();

  const existing = await chrome.storage.local.get(["mode", "allowedSites"]);
  if (!existing.mode) {
    await chrome.storage.local.set({ mode: "inline" });
  }
  if (!existing.allowedSites) {
    await chrome.storage.local.set({ allowedSites: [] });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await loadAndStoreCourses();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_COURSE_COUNT") {
    chrome.storage.local.get("courses", ({ courses }) => {
      sendResponse({ count: courses ? Object.keys(courses).length : 0 });
    });
    return true; // keep channel open for async response
  }
  if (message.type === "RELOAD_COURSES") {
    loadAndStoreCourses().then(() => sendResponse({ ok: true }));
    return true;
  }
});
