(function () {
  "use strict";

  if (document.contentType === "application/pdf") return;
  if (window.location.pathname.toLowerCase().endsWith(".pdf")) return;

  let courses = {};
  let courseRegex = null;
  let mode = "inline";
  let enabled = false;
  let observer = null;
  let injectedStyles = false;

  const PROCESSED_ATTR = "data-cce-done";

  function buildRegex(courseMap) {
    const patterns = Object.keys(courseMap).map((code) => {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flexible = escaped.replace(/\\ /g, "[\\s]?");
      return `(?<![\\w-])${flexible}(?![\\w-])`;
    });
    return new RegExp(patterns.join("|"), "gi");
  }

  function resolve(matched) {
    const upper = matched.toUpperCase().replace(/\s+/g, " ").trim();
    if (courses[upper]) return { key: upper, name: courses[upper] };
    const noSpace = upper.replace(/\s/g, "");
    for (const key of Object.keys(courses)) {
      if (key.replace(/\s/g, "") === noSpace) return { key, name: courses[key] };
    }
    return null;
  }

  function isHostAllowed(host, allowedSites) {
    return allowedSites.some(pattern => {
      // Convert pattern like *.university.edu to regex
      const regexPattern = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
      return new RegExp(regexPattern, "i").test(host);
    });
  }

  function injectStyles() {
    if (injectedStyles) return;
    injectedStyles = true;
    const style = document.createElement("style");
    style.id = "cce-custom-styles";
    style.textContent = `
      .cce-tooltip-wrap {
        position: relative;
        display: inline;
        cursor: help;
        border-bottom: 1px dashed #ff8000;
        color: inherit;
      }
      .cce-highlight {
        position: relative;
        display: inline;
        cursor: help;
        background-color: #ffe6cc; /* Pale Orange */
        color: #4a2500;
        padding: 0 2px;
        border-radius: 3px;
        font-weight: 500;
      }
      .cce-tooltip-text {
        visibility: hidden;
        opacity: 0;
        background: #2a1a10;
        color: #fff6ee;
        font-size: 0.78em;
        font-family: 'Segoe UI', system-ui, sans-serif;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid #ff8000;
        white-space: nowrap;
        position: absolute;
        z-index: 2147483647;
        bottom: 130%;
        left: 50%;
        transform: translateX(-50%);
        box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        transition: opacity 0.18s ease;
        pointer-events: none;
      }
      .cce-tooltip-wrap:hover .cce-tooltip-text,
      .cce-highlight:hover .cce-tooltip-text {
        visibility: visible;
        opacity: 1;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT",
    "SELECT", "OPTION", "CODE", "PRE", "KBD", "SAMP",
    "SVG", "MATH", "CANVAS", "IFRAME", "OBJECT", "EMBED",
    "HEAD", "META", "LINK", "TITLE",
  ]);

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  function processTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!courseRegex.test(text)) return null;
    courseRegex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let replaced = false;

    courseRegex.lastIndex = 0;
    while ((match = courseRegex.exec(text)) !== null) {
      const resolved = resolve(match[0]);
      if (!resolved) continue;

      replaced = true;

      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (mode === "tooltip") {
        const wrap = document.createElement("span");
        wrap.className = "cce-tooltip-wrap";
        wrap.setAttribute(PROCESSED_ATTR, "1");
        wrap.textContent = match[0];
        const tip = document.createElement("span");
        tip.className = "cce-tooltip-text";
        tip.textContent = resolved.name;
        wrap.appendChild(tip);
        frag.appendChild(wrap);
      } else if (mode === "highlight") {
        const wrap = document.createElement("span");
        wrap.className = "cce-highlight";
        wrap.setAttribute(PROCESSED_ATTR, "1");
        wrap.textContent = match[0];
        const tip = document.createElement("span");
        tip.className = "cce-tooltip-text";
        tip.textContent = resolved.name;
        wrap.appendChild(tip);
        frag.appendChild(wrap);
      } else {
        frag.appendChild(document.createTextNode(`${match[0]} (${resolved.name})`));
      }

      lastIndex = match.index + match[0].length;
    }

    if (!replaced) return null;
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    return frag;
  }

  function processNode(root) {
    if (!courseRegex || !enabled) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          let el = node.parentElement;
          while (el && el !== root.parentElement) {
            if (shouldSkipElement(el)) return NodeFilter.FILTER_REJECT;
            if (el.hasAttribute && el.hasAttribute(PROCESSED_ATTR)) return NodeFilter.FILTER_REJECT;
            el = el.parentElement;
          }
          return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      }
    );

    const replacements = [];
    let node;
    while ((node = walker.nextNode())) {
      const frag = processTextNode(node);
      if (frag) replacements.push({ node, frag });
    }

    for (const { node: textNode, frag } of replacements) {
      const parent = textNode.parentNode;
      if (parent) parent.replaceChild(frag, textNode);
    }
  }

  let scanTimeout = null;
  const nodesToProcess = new Set();

  function processQueuedNodes() {
    scanTimeout = null;
    if (!enabled || !courseRegex) return;

    for (const node of nodesToProcess) {

      if (document.contains(node)) {
         if (node.nodeType === Node.ELEMENT_NODE) {
            processNode(node);
         } else if (node.nodeType === Node.TEXT_NODE) {
            const frag = processTextNode(node);
            if (frag && node.parentNode) node.parentNode.replaceChild(frag, node);
         }
      }
    }
    nodesToProcess.clear();
  }

  function scheduleProcess(node) {
    nodesToProcess.add(node);
    if (!scanTimeout) {

      scanTimeout = setTimeout(processQueuedNodes, 100);
    }
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            scheduleProcess(node);
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (scanTimeout) {
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
    nodesToProcess.clear();
  }

  function init(storageData) {
    courses = storageData.courses || {};
    mode = storageData.mode || "inline";
    const allowedSites = storageData.allowedSites || [];
    const currentHost = window.location.hostname;
    enabled = isHostAllowed(currentHost, allowedSites);

    if (!enabled || Object.keys(courses).length === 0) return;

    courseRegex = buildRegex(courses);

    if (mode === "tooltip" || mode === "highlight") {
      injectStyles();
    }

    processNode(document.body || document.documentElement);

    startObserver();
  }

  chrome.storage.local.get(["courses", "mode", "allowedSites"], init);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TOGGLE_SITE" || message.type === "MODE_CHANGED") {

      window.location.reload();
    }
  });
})();
