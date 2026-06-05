// content.js — Finds UIU course codes on the page and adds their full names!

(function () {
  "use strict";

  // Skip PDFs, our DOM scripts won't work there anyway
  if (document.contentType === "application/pdf") return;
  if (window.location.pathname.toLowerCase().endsWith(".pdf")) return;

  let courses = {};
  let courseRegex = null;
  let mode = "highlight";
  let enabled = false;
  let observer = null;
  let injectedStyles = false;

  // We tag processed elements so we don't end up checking them twice in a loop
  const PROCESSED_ATTR = "data-cce-done";

  // Build one big regex from all the course codes.
  // The flexible pattern makes sure "PHY1103" and "PHY  1103" both work!
  function buildRegex(courseMap) {
    const patterns = Object.keys(courseMap).map((code) => {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flexible = escaped.replace(/\\ /g, "[\\s]*");
      return `(?<![\\w-])${flexible}(?![\\w-])`;
    });
    return new RegExp(patterns.join("|"), "gi");
  }

  // Matches the text to a course, ignoring extra spaces
  function resolve(matched) {
    const upper = matched.toUpperCase().replace(/\s+/g, " ").trim();
    if (courses[upper]) return { key: upper, name: courses[upper] };
    const noSpace = upper.replace(/\s/g, "");
    for (const key of Object.keys(courses)) {
      if (key.replace(/\s/g, "") === noSpace) return { key, name: courses[key] };
    }
    return null;
  }

  // Checks if the extension should run on this site.
  // We also check ancestor frames to make sure it works inside iframes (like embedded google sheets)!
  function isHostAllowed(host, allowedSites) {
    const matches = (h) =>
      allowedSites.some((pattern) => {
        const re = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
        return new RegExp(re, "i").test(h);
      });

    if (matches(host)) return true;

    // Check ancestor frames for cross-origin iframes
    if (window.location.ancestorOrigins) {
      for (let i = 0; i < window.location.ancestorOrigins.length; i++) {
        try {
          const origin = window.location.ancestorOrigins[i];
          if (origin && origin !== "null") {
            if (matches(new URL(origin).hostname)) return true;
          }
        } catch (e) {}
      }
    }

    // Same-origin fallback
    try {
      if (window !== window.top && window.top.location.hostname) {
        if (matches(window.top.location.hostname)) return true;
      }
    } catch (e) {}

    return false;
  }

  // Inject CSS once per page. We use one shared tooltip <div> that we move
  // around with JS instead of creating one tooltip per element (much faster!)
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
        background-color: #ffe6cc;
        color: #4a2500;
        padding: 0 2px;
        border-radius: 3px;
        font-weight: 500;
      }
      .cce-global-tooltip {
        visibility: hidden;
        opacity: 0;
        background: #2a1a10;
        color: #fff6ee;
        font-size: 0.78em;
        font-family: 'Segoe UI', system-ui, sans-serif;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid #ff8000;
        white-space: normal;
        max-width: 300px;
        text-align: center;
        word-wrap: break-word;
        position: fixed;
        z-index: 2147483647;
        transform: translateX(-50%);
        box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        transition: opacity 0.18s ease;
        pointer-events: none;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    // One global tooltip element, repositioned on mouseover
    const globalTooltip = document.createElement("div");
    globalTooltip.className = "cce-global-tooltip";
    (document.body || document.documentElement).appendChild(globalTooltip);

    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest
        ? e.target.closest(".cce-tooltip-wrap, .cce-highlight")
        : null;
      if (target && target.dataset.cceName) {
        globalTooltip.textContent = target.dataset.cceName;
        const rect = target.getBoundingClientRect();
        globalTooltip.style.left = rect.left + rect.width / 2 + "px";
        globalTooltip.style.bottom = window.innerHeight - rect.top + 5 + "px";
        globalTooltip.style.visibility = "visible";
        globalTooltip.style.opacity = "1";
      }
    });

    document.addEventListener("mouseout", (e) => {
      if (e.target.closest && e.target.closest(".cce-tooltip-wrap, .cce-highlight")) {
        globalTooltip.style.visibility = "hidden";
        globalTooltip.style.opacity = "0";
      }
    });
  }

  // Tags whose text we shouldn't mess with
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT",
    "SELECT", "OPTION", "CODE", "PRE", "KBD", "SAMP",
    "MATH", "CANVAS", "IFRAME", "OBJECT", "EMBED",
    "HEAD", "META", "LINK", "TITLE",
  ]);

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  // Check if a node is inside a skipped element or one we already processed
  function isInsideSkippedElement(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el) {
      if (shouldSkipElement(el)) return true;
      if (el.hasAttribute && el.hasAttribute(PROCESSED_ATTR)) return true;
      el = el.parentElement;
    }
    return false;
  }

  // Some sites are tricky and split course codes with HTML (like <span> or <br>).
  // We try to merge them back into a single plain text node before scanning.
  function normalizeCourseSplits(root) {
    if (!root || !root.querySelectorAll) return;

    // Fix 1: Flatten inline elements containing only a course code
    try {
      const elements = root.querySelectorAll(
        "td, th, span, p, a, b, strong, i, em, label, div, li, h1, h2, h3, h4, h5, h6"
      );
      for (const el of elements) {
        if (shouldSkipElement(el)) continue;
        if (el.children.length === 0) continue;
        
        // Skip anything with block elements inside to avoid messing up the page layout
        if (el.querySelector("div, p, table, ul, ol, li, section, article, tr, td")) continue;
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (resolve(text)) el.textContent = text;
      }
    } catch (e) {}

    // Fix 2: Remove <br> tags splitting the letter prefix and digit suffix
    try {
      const brs = root.querySelectorAll("br");
      for (const br of brs) {
        if (!br.parentNode) continue;

        let prev = br.previousSibling;
        let next = br.nextSibling;
        
        // Ignore empty text nodes
        while (prev && prev.nodeType === Node.TEXT_NODE && !prev.nodeValue.trim())
          prev = prev.previousSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim())
          next = next.nextSibling;

        // If the <br> sits right between "letters" and "numbers", remove it
        if (
          prev && next &&
          prev.nodeType === Node.TEXT_NODE &&
          next.nodeType === Node.TEXT_NODE &&
          /[a-zA-Z]{2,4}\s*-?\s*$/.test(prev.nodeValue) &&
          /^\s*\d{3,4}/.test(next.nodeValue)
        ) {
          prev.nodeValue = prev.nodeValue.replace(/\s*$/, "") + " " + next.nodeValue.replace(/^\s*/, "");
          next.parentNode.removeChild(next);
          br.parentNode.removeChild(br);
        }
      }
    } catch (e) {}
  }

  // Scans a single text node for courses and replaces matches with styled spans/tspans.
  // We handle SVG text (like in Highcharts) carefully so we don't break charts!
  function processTextNode(textNode) {
    let text = textNode.nodeValue;
    let matchText = text;
    let isHighchartsTruncated = false;
    let titleElToRemove = null;

    // Highcharts truncates long labels with "…" and puts the real value in a <title>.
    // Let's grab the real value from the <title> so we can decode it!
    let elForTitle = textNode.parentElement;
    while (elForTitle && elForTitle !== document.documentElement) {
      const tag = elForTitle.tagName && elForTitle.tagName.toUpperCase();
      if (tag === "SVG") break;
      if (tag === "TEXT" || tag === "G") {
        const titleEl = elForTitle.querySelector("title");
        if (titleEl) {
          titleElToRemove = titleEl;
          if (text.includes("…") || text.endsWith("...")) {
            matchText = titleEl.textContent;
            isHighchartsTruncated = true;
          }
          break;
        }
      }
      elForTitle = elForTitle.parentElement;
    }

    if (!courseRegex.test(matchText)) return null;
    courseRegex.lastIndex = 0;

    // Check if we're inside an SVG chart or its tooltip
    let isSvg = false;
    let isTooltip = false;
    let curr = textNode.parentElement;
    while (curr && curr !== document.documentElement) {
      if (curr.tagName && curr.tagName.toUpperCase() === "SVG") isSvg = true;
      if (curr.classList && curr.classList.contains("highcharts-tooltip")) isTooltip = true;
      curr = curr.parentElement;
    }

    // CSS tooltips don't work in SVGs, so we force highlight mode for charts
    let effectiveMode = mode;
    if (isSvg && !isTooltip) effectiveMode = "highlight";
    else if (isTooltip) effectiveMode = "inline";

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let replaced = false;

    courseRegex.lastIndex = 0;
    while ((match = courseRegex.exec(matchText)) !== null) {
      const resolved = resolve(match[0]);
      if (!resolved) continue;
      replaced = true;

      // For truncated chart labels ("CSE …"), just highlight the whole thing
      if (isHighchartsTruncated) {
        const wrap = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        wrap.setAttribute(PROCESSED_ATTR, "1");
        wrap.classList.add("cce-highlight");
        wrap.dataset.cceName = resolved.name;
        wrap.style.cursor = "help";
        wrap.setAttribute("fill", "#ff8000");
        wrap.setAttribute("font-weight", "bold");
        wrap.textContent = text;
        frag.appendChild(wrap);
        break;
      }

      // Add the normal text before the matched course
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (isSvg) {
        const wrap = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        wrap.setAttribute(PROCESSED_ATTR, "1");

        if (effectiveMode === "inline") {
          // Wrap text inside SVG tooltips to prevent it from bleeding out
          wrap.setAttribute("font-weight", "bold");
          const fullText = `${match[0]} (${resolved.name})`;
          const words = fullText.split(" ");
          let currentLine = "";
          let firstLine = true;

          for (const word of words) {
            if (currentLine.length + word.length > 23) {
              if (currentLine.length > 0) {
                const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                if (!firstLine) {
                  span.setAttribute("dy", "1.2em");
                  span.setAttribute("x", "8");
                }
                span.textContent = currentLine.trim();
                wrap.appendChild(span);
                firstLine = false;
              }
              currentLine = word + " ";
            } else {
              currentLine += word + " ";
            }
          }
          if (currentLine.trim().length > 0) {
            const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            if (!firstLine) {
              span.setAttribute("dy", "1.2em");
              span.setAttribute("x", "8");
            }
            span.textContent = currentLine.trim();
            wrap.appendChild(span);
          }
        } else {
          // Regular highlight in an SVG
          wrap.style.cursor = "help";
          wrap.dataset.cceName = resolved.name;
          wrap.setAttribute("fill", "#ff8000");
          if (effectiveMode === "highlight") {
            wrap.classList.add("cce-highlight");
            wrap.setAttribute("font-weight", "bold");
          } else {
            wrap.classList.add("cce-tooltip-wrap");
            wrap.setAttribute("text-decoration", "underline");
          }
          wrap.textContent = match[0];
        }

        frag.appendChild(wrap);
      } else {
        // Normal HTML text
        const wrap = document.createElement("span");
        wrap.setAttribute(PROCESSED_ATTR, "1");
        if (effectiveMode === "tooltip") {
          wrap.className = "cce-tooltip-wrap";
          wrap.dataset.cceName = resolved.name;
          wrap.textContent = match[0];
        } else if (effectiveMode === "highlight") {
          wrap.className = "cce-highlight";
          wrap.dataset.cceName = resolved.name;
          wrap.textContent = match[0];
        } else {
          wrap.className = "cce-inline";
          wrap.textContent = `${match[0]} (${resolved.name})`;
        }
        frag.appendChild(wrap);
      }

      lastIndex = match.index + match[0].length;
    }

    if (!replaced) return null;

    if (!isHighchartsTruncated && lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    // Remove old <title> attributes so they don't block our custom tooltip
    if (titleElToRemove) titleElToRemove.remove();
    let pNode = textNode.parentElement;
    while (pNode && pNode !== document.documentElement) {
      if (pNode.hasAttribute && pNode.hasAttribute("title")) pNode.removeAttribute("title");
      pNode = pNode.parentElement;
    }

    return frag;
  }

  // Walk through the DOM looking for text nodes to process
  function processNode(root) {
    if (!courseRegex || !enabled) return;
    if (isInsideSkippedElement(root)) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (shouldSkipElement(node)) return NodeFilter.FILTER_REJECT;
            if (node.hasAttribute && node.hasAttribute(PROCESSED_ATTR)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_SKIP;
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
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  // Highcharts draws its tooltips perfectly wrapped to the original short text.
  // Since we add the long course names, we have to stretch the background box manually!
  function adjustHighchartsTooltipBackground(tooltipGroup) {
    const origBox = tooltipGroup.querySelector(".highcharts-label-box");
    if (!origBox) return;

    origBox.style.display = "none";
    setTimeout(() => {
      const textEl = tooltipGroup.querySelector("text");
      if (!textEl) return;

      const bbox = textEl.getBBox();
      let customBg = tooltipGroup.querySelector(".cce-custom-tooltip-bg");
      if (!customBg) {
        customBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        customBg.setAttribute("class", "cce-custom-tooltip-bg");
        customBg.setAttribute("fill", origBox.getAttribute("fill") || "rgba(255,255,255,0.95)");
        customBg.setAttribute("stroke", origBox.getAttribute("stroke") || "#cccccc");
        customBg.setAttribute("stroke-width", origBox.getAttribute("stroke-width") || "1");
        customBg.setAttribute("rx", "5");
        tooltipGroup.insertBefore(customBg, tooltipGroup.firstChild);
      }

      customBg.setAttribute("x", bbox.x - 10);
      customBg.setAttribute("y", bbox.y - 10);
      customBg.setAttribute("width", bbox.width + 20);
      customBg.setAttribute("height", bbox.height + 20);
    }, 0);
  }

  // We queue up DOM changes and process them in batches every 100ms
  // so we don't lag the page when lots of nodes are added at once
  let scanTimeout = null;
  const nodesToProcess = new Set();

  function processQueuedNodes() {
    scanTimeout = null;
    if (!enabled || !courseRegex) return;

    for (const node of nodesToProcess) {
      if (!document.contains(node)) continue;

      if (node.nodeType === Node.ELEMENT_NODE) {
        normalizeCourseSplits(node);
        processNode(node);
      } else if (node.nodeType === Node.TEXT_NODE && !isInsideSkippedElement(node)) {
        if (node.parentNode) normalizeCourseSplits(node.parentNode);
        const frag = processTextNode(node);
        if (frag && node.parentNode) {
          const parent = node.parentNode;
          parent.replaceChild(frag, node);

          // If we just edited text inside a Highcharts tooltip, fix its background box
          let tg = parent;
          while (tg && tg !== document.documentElement) {
            if (tg.classList && tg.classList.contains("highcharts-tooltip")) break;
            tg = tg.parentNode;
          }
          if (tg && tg !== document.documentElement) {
            adjustHighchartsTooltipBackground(tg);
          }
        }
      }
    }
    nodesToProcess.clear();
  }

  function scheduleProcess(node) {
    nodesToProcess.add(node);
    if (!scanTimeout) scanTimeout = setTimeout(processQueuedNodes, 100);
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

  // Load everything up once we have our settings from storage
  function init(storageData) {
    courses = storageData.courses || {};
    mode = storageData.mode || "highlight";
    const allowedSites = storageData.allowedSites || [];
    enabled = isHostAllowed(window.location.hostname, allowedSites);

    if (!enabled || Object.keys(courses).length === 0) return;

    courseRegex = buildRegex(courses);
    injectStyles();

    const rootNode = document.body || document.documentElement;
    normalizeCourseSplits(rootNode);
    processNode(rootNode);
    startObserver();
  }

  chrome.storage.local.get(["courses", "mode", "allowedSites"], init);

  // If the user changes settings or updates courses in the popup, reload the page to apply them!
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TOGGLE_SITE" || message.type === "MODE_CHANGED" || message.type === "COURSES_UPDATED") {
      window.location.reload();
    }
  });
})();
