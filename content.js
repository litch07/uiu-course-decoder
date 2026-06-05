// content.js — Scans page text nodes for UIU course codes and decorates them
// based on the user's chosen display mode (highlight / tooltip / inline).

(function () {
  "use strict";

  // Skip PDF files — there is nothing useful we can do with them.
  if (document.contentType === "application/pdf") return;
  if (window.location.pathname.toLowerCase().endsWith(".pdf")) return;

  let courses = {};
  let courseRegex = null;
  let mode = "highlight";
  let enabled = false;
  let observer = null;
  let injectedStyles = false;

  // Attribute we stamp on every element we have already processed,
  // so the MutationObserver doesn't process the same node twice.
  const PROCESSED_ATTR = "data-cce-done";

  // ---------------------------------------------------------------------------
  // Build a single combined regex from every course code in the map.
  // The flexible pattern lets "PHY1103" and "PHY  1103" both match "PHY 1103".
  // ---------------------------------------------------------------------------
  function buildRegex(courseMap) {
    const patterns = Object.keys(courseMap).map((code) => {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flexible = escaped.replace(/\\ /g, "[\\s]*");
      return `(?<![\\w-])${flexible}(?![\\w-])`;
    });
    return new RegExp(patterns.join("|"), "gi");
  }

  // Look up a matched string in the courses map, tolerating extra whitespace.
  function resolve(matched) {
    const upper = matched.toUpperCase().replace(/\s+/g, " ").trim();
    if (courses[upper]) return { key: upper, name: courses[upper] };
    const noSpace = upper.replace(/\s/g, "");
    for (const key of Object.keys(courses)) {
      if (key.replace(/\s/g, "") === noSpace) return { key, name: courses[key] };
    }
    return null;
  }

  // Check whether the extension is allowed to run on `host`.
  // For iframes, we walk up the ancestor chain so enabling a parent domain
  // automatically enables any iframes it embeds.
  function isHostAllowed(host, allowedSites) {
    const matches = (h) =>
      allowedSites.some((pattern) => {
        const re = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
        return new RegExp(re, "i").test(h);
      });

    if (matches(host)) return true;

    // Check ancestor frames (available in modern Chrome for cross-origin iframes).
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

    // Same-origin fallback: try accessing window.top directly.
    try {
      if (window !== window.top && window.top.location.hostname) {
        if (matches(window.top.location.hostname)) return true;
      }
    } catch (e) {}

    return false;
  }

  // ---------------------------------------------------------------------------
  // Inject CSS once per page, plus a single shared tooltip <div> that we move
  // with JS instead of creating one tooltip per element (much cheaper).
  // ---------------------------------------------------------------------------
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

    // One global tooltip element, repositioned on mouseover.
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

  // Tags whose content we must never touch.
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

  // Walk up the DOM to see if a node lives inside a skipped element or one
  // we have already processed. If so, we leave it alone.
  function isInsideSkippedElement(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el) {
      if (shouldSkipElement(el)) return true;
      if (el.hasAttribute && el.hasAttribute(PROCESSED_ATTR)) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Some sites render course codes split across HTML elements, e.g.:
  //   <td>PHY<br>1103</td>  or  <td><span>CSE</span><span>3421</span></td>
  //
  // This function fixes two common patterns before the main text scan:
  //   1. Inline-only containers whose entire text resolves to a course code —
  //      we flatten them to a plain text node.
  //   2. <br> tags that sit between a letter prefix and a digit suffix —
  //      we remove the <br> and merge the surrounding text nodes.
  // ---------------------------------------------------------------------------
  function normalizeCourseSplits(root) {
    if (!root || !root.querySelectorAll) return;

    try {
      const elements = root.querySelectorAll(
        "td, th, span, p, a, b, strong, i, em, label, div, li, h1, h2, h3, h4, h5, h6"
      );
      for (const el of elements) {
        if (shouldSkipElement(el)) continue;
        if (el.children.length === 0) continue;
        // Don't collapse elements that contain block-level children — that
        // would destroy the page layout.
        if (el.querySelector("div, p, table, ul, ol, li, section, article, tr, td")) continue;
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (resolve(text)) el.textContent = text;
      }
    } catch (e) {}

    try {
      const brs = root.querySelectorAll("br");
      for (const br of brs) {
        if (!br.parentNode) continue;

        let prev = br.previousSibling;
        let next = br.nextSibling;
        // Skip empty whitespace-only text nodes on either side.
        while (prev && prev.nodeType === Node.TEXT_NODE && !prev.nodeValue.trim())
          prev = prev.previousSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim())
          next = next.nextSibling;

        // Merge only when the <br> is between "letters" and "digits" — the
        // two halves of a split course code.
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

  // ---------------------------------------------------------------------------
  // Process a single text node: find all course codes, replace each one with
  // the appropriate decorated element (span for HTML, tspan for SVG).
  //
  // SVG charts (e.g. Highcharts) are handled specially:
  //   - Inside a tooltip  → inline mode (full name in parentheses, word-wrapped)
  //   - Truncated labels  → colour the visible text and store the full name
  //   - Other SVG text    → highlight mode regardless of user setting
  // ---------------------------------------------------------------------------
  function processTextNode(textNode) {
    let text = textNode.nodeValue;
    let matchText = text;
    let isHighchartsTruncated = false;
    let titleElToRemove = null;

    // Highcharts truncates long axis labels with "…" and stores the real value
    // in a child <title> element. Detect that and use the full text for matching.
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

    // Determine SVG context so we can pick the right element type and style.
    let isSvg = false;
    let isTooltip = false;
    let curr = textNode.parentElement;
    while (curr && curr !== document.documentElement) {
      if (curr.tagName && curr.tagName.toUpperCase() === "SVG") isSvg = true;
      if (curr.classList && curr.classList.contains("highcharts-tooltip")) isTooltip = true;
      curr = curr.parentElement;
    }

    // Override the user's mode for SVG contexts where CSS classes don't apply.
    let effectiveMode = mode;
    if (isSvg && !isTooltip) effectiveMode = "highlight";
    else if (isTooltip) effectiveMode = "inline";

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let replaced = false;

    courseRegex.lastIndex = 0;
    while ((match = courseRegex.exec(matchText)) !== null) {
      const resolved = resolve(match[0]);
      if (!resolved) continue;
      replaced = true;

      // Special case: the visible text is truncated ("CSE …"). Replace the
      // whole node with a highlighted tspan showing the truncated text.
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

      // Append any plain text that came before this match.
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (isSvg) {
        const wrap = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        wrap.setAttribute(PROCESSED_ATTR, "1");

        if (effectiveMode === "inline") {
          // Tooltip mode: word-wrap the "CODE (Name)" text into multiple tspans.
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
          // Highlight or tooltip mode in SVG: colour the text and attach the name.
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
        // Regular HTML path.
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

    // Remove any native <title> or title="" attributes that would conflict
    // with our custom tooltip.
    if (titleElToRemove) titleElToRemove.remove();
    let pNode = textNode.parentElement;
    while (pNode && pNode !== document.documentElement) {
      if (pNode.hasAttribute && pNode.hasAttribute("title")) pNode.removeAttribute("title");
      pNode = pNode.parentElement;
    }

    return frag;
  }

  // Walk `root` with a TreeWalker, collect all text nodes that need replacing,
  // then do the replacements in a second pass to avoid invalidating the walker.
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

  // ---------------------------------------------------------------------------
  // Highcharts resizes its tooltip box to fit the original (short) text. After
  // we expand it with the course name, we need to resize the background rect.
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // MutationObserver queue — batches DOM mutations into a single 100 ms timeout
  // so rapidly-added nodes (e.g. virtual scroll lists) don't cause a flood of
  // synchronous re-scans.
  // ---------------------------------------------------------------------------
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

          // If this text node was inside a Highcharts tooltip, fix the background.
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

  // Entry point — called once with data from chrome.storage.
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

  // The popup sends this message after the user toggles a site or changes mode.
  // The simplest correct response is a full page reload so the new settings apply.
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TOGGLE_SITE" || message.type === "MODE_CHANGED") {
      window.location.reload();
    }
  });
})();
