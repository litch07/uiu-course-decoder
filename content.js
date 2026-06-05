(function () {
  "use strict";

  if (document.contentType === "application/pdf") return;
  if (window.location.pathname.toLowerCase().endsWith(".pdf")) return;

  let courses = {};
  let courseRegex = null;
  let mode = "highlight";
  let enabled = false;
  let observer = null;
  let injectedStyles = false;

  const PROCESSED_ATTR = "data-cce-done";

  function buildRegex(courseMap) {
    const patterns = Object.keys(courseMap).map((code) => {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flexible = escaped.replace(/\\ /g, "[\\s]*"); // Match zero or more whitespaces (handles PHY1103 and PHY  1103)
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
    const isAllowed = (h) => allowedSites.some(pattern => {
      // Convert wildcard pattern (e.g. *.university.edu) to regex
      const regexPattern = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
      return new RegExp(regexPattern, "i").test(h);
    });

    if (isAllowed(host)) return true;

    // For iframes: check if any ancestor origin is allowed
    if (window.location.ancestorOrigins) {
      for (let i = 0; i < window.location.ancestorOrigins.length; i++) {
        try {
          const ancestorOrigin = window.location.ancestorOrigins[i];
          if (ancestorOrigin && ancestorOrigin !== "null") {
            const ancestorHost = new URL(ancestorOrigin).hostname;
            if (isAllowed(ancestorHost)) return true;
          }
        } catch (e) { }
      }
    }

    // Fallback for same-origin top-level access
    try {
      if (window !== window.top && window.top.location.hostname) {
        if (isAllowed(window.top.location.hostname)) return true;
      }
    } catch (e) { }

    return false;
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

    const globalTooltip = document.createElement("div");
    globalTooltip.className = "cce-global-tooltip";
    (document.body || document.documentElement).appendChild(globalTooltip);

    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest ? e.target.closest(".cce-tooltip-wrap, .cce-highlight") : null;
      if (target && target.dataset.cceName) {
        globalTooltip.textContent = target.dataset.cceName;
        const rect = target.getBoundingClientRect();
        globalTooltip.style.left = (rect.left + rect.width / 2) + "px";
        globalTooltip.style.bottom = (window.innerHeight - rect.top + 5) + "px";
        globalTooltip.style.visibility = "visible";
        globalTooltip.style.opacity = "1";
      }
    });

    document.addEventListener("mouseout", (e) => {
      const target = e.target.closest ? e.target.closest(".cce-tooltip-wrap, .cce-highlight") : null;
      if (target) {
        globalTooltip.style.visibility = "hidden";
        globalTooltip.style.opacity = "0";
      }
    });
  }

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT",
    "SELECT", "OPTION", "CODE", "PRE", "KBD", "SAMP",
    "MATH", "CANVAS", "IFRAME", "OBJECT", "EMBED",
    "HEAD", "META", "LINK", "TITLE"
  ]);

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  function isInsideSkippedElement(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el) {
      if (shouldSkipElement(el) || (el.hasAttribute && el.hasAttribute(PROCESSED_ATTR))) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function normalizeCourseSplits(root) {
    if (!root || !root.querySelectorAll) return;

    // 1. Unify elements whose entire text is exactly a course code but are split by inline tags (like <br> or <span>)
    // E.g. <td>PHY<br> 1103</td> -> <td>PHY 1103</td>
    try {
      const elements = root.querySelectorAll('td, th, span, p, a, b, strong, i, em, label, div, li, h1, h2, h3, h4, h5, h6');
      for (const el of elements) {
        if (shouldSkipElement(el)) continue;
        if (el.children.length === 0) continue;
        
        // Skip if it contains block elements to avoid destroying layout
        if (el.querySelector('div, p, table, ul, ol, li, section, article, tr, td')) continue;

        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (resolve(text)) {
          el.textContent = text;
        }
      }
    } catch (e) {}

    // 2. Remove <br> tags that split a course code inside a larger text block
    try {
      const brs = root.querySelectorAll('br');
      for (const br of brs) {
        if (!br.parentNode) continue;
        let prev = br.previousSibling;
        let next = br.nextSibling;
        
        while (prev && prev.nodeType === Node.TEXT_NODE && !prev.nodeValue.trim()) prev = prev.previousSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim()) next = next.nextSibling;

        if (prev && next && prev.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
          const prevText = prev.nodeValue;
          const nextText = next.nodeValue;
          
          if (/[a-zA-Z]{2,4}\s*-?\s*$/.test(prevText) && /^\s*\d{3,4}/.test(nextText)) {
            prev.nodeValue = prevText.replace(/\s*$/, '') + " " + nextText.replace(/^\s*/, '');
            next.parentNode.removeChild(next);
            br.parentNode.removeChild(br);
          }
        }
      }
    } catch (e) {}
  }

  function processTextNode(textNode) {
    let text = textNode.nodeValue;
    let matchText = text;
    let isHighchartsTruncated = false;
    let titleElToRemove = null;

    // Detect Highcharts SVG labels with truncated text and a <title> holding the full value
    let elForTitle = textNode.parentElement;
    while (elForTitle && elForTitle !== document.documentElement) {
      if (elForTitle.tagName && elForTitle.tagName.toUpperCase() === 'SVG') break;
      if (elForTitle.tagName && (elForTitle.tagName.toUpperCase() === 'TEXT' || elForTitle.tagName.toUpperCase() === 'G')) {
        const titleEl = elForTitle.querySelector('title');
        if (titleEl) {
          titleElToRemove = titleEl;
          if (text.includes('…') || text.endsWith('...')) {
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

    let el = textNode.parentElement;
    let isSvg = false;
    let isTooltip = false;

    let curr = el;
    while (curr && curr !== document.documentElement) {
      if (curr.tagName && curr.tagName.toUpperCase() === 'SVG') {
        isSvg = true;
      }
      if (curr.classList && curr.classList.contains('highcharts-tooltip')) {
        isTooltip = true;
      }
      curr = curr.parentElement;
    }

    let effectiveMode = mode;
    if (isSvg && !isTooltip) {
      effectiveMode = "highlight";
    } else if (isTooltip) {
      effectiveMode = "inline";
    }

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let replaced = false;

    courseRegex.lastIndex = 0;
    while ((match = courseRegex.exec(matchText)) !== null) {
      const resolved = resolve(match[0]);
      if (!resolved) continue;

      replaced = true;

      if (isHighchartsTruncated) {
        // Replace the whole truncated label (e.g. "CSE …") with the highlight wrapper
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

      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (isSvg) {
        if (effectiveMode === "inline") {
          const wrap = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          wrap.setAttribute(PROCESSED_ATTR, "1");

          if (isTooltip) {
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
            wrap.textContent = `${match[0]} (${resolved.name})`;
          }
          frag.appendChild(wrap);
        } else {
          const wrap = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          wrap.setAttribute(PROCESSED_ATTR, "1");
          wrap.style.cursor = "help";
          wrap.dataset.cceName = resolved.name;

          if (effectiveMode === "highlight") {
            wrap.classList.add("cce-highlight");
            wrap.setAttribute("fill", "#ff8000");
            wrap.setAttribute("font-weight", "bold");
          } else {
            wrap.classList.add("cce-tooltip-wrap");
            wrap.setAttribute("fill", "#ff8000");
            wrap.setAttribute("text-decoration", "underline");
          }

          wrap.textContent = match[0];
          frag.appendChild(wrap);
        }
      } else {
        if (effectiveMode === "tooltip") {
          const wrap = document.createElement("span");
          wrap.className = "cce-tooltip-wrap";
          wrap.setAttribute(PROCESSED_ATTR, "1");
          wrap.dataset.cceName = resolved.name;
          wrap.textContent = match[0];
          frag.appendChild(wrap);
        } else if (effectiveMode === "highlight") {
          const wrap = document.createElement("span");
          wrap.className = "cce-highlight";
          wrap.setAttribute(PROCESSED_ATTR, "1");
          wrap.dataset.cceName = resolved.name;
          wrap.textContent = match[0];
          frag.appendChild(wrap);
        } else {
          const wrap = document.createElement("span");
          wrap.setAttribute(PROCESSED_ATTR, "1");
          wrap.className = "cce-inline";
          wrap.textContent = `${match[0]} (${resolved.name})`;
          frag.appendChild(wrap);
        }
      }

      lastIndex = match.index + match[0].length;
    }

    if (!replaced) return null;
    if (!isHighchartsTruncated && lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    // Remove native <title> elements and title attributes that would conflict with our tooltip
    if (titleElToRemove) {
      titleElToRemove.remove();
    }

    let pNode = textNode.parentElement;
    while (pNode && pNode !== document.documentElement) {
      if (pNode.hasAttribute && pNode.hasAttribute('title')) {
        pNode.removeAttribute('title');
      }
      pNode = pNode.parentElement;
    }

    return frag;
  }

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
      const parent = textNode.parentNode;
      if (parent) parent.replaceChild(frag, textNode);
    }
  }

  let scanTimeout = null;
  const nodesToProcess = new Set();

  function adjustHighchartsTooltipBackground(tooltipGroup) {
    const origBox = tooltipGroup.querySelector('.highcharts-label-box');
    if (origBox) {
      origBox.style.display = 'none';

      setTimeout(() => {
        const textEl = tooltipGroup.querySelector('text');
        if (!textEl) return;
        const bbox = textEl.getBBox();

        let customBg = tooltipGroup.querySelector('.cce-custom-tooltip-bg');
        if (!customBg) {
          customBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          customBg.setAttribute("class", "cce-custom-tooltip-bg");
          const fill = origBox.getAttribute("fill") || "rgba(255, 255, 255, 0.95)";
          const stroke = origBox.getAttribute("stroke") || "#cccccc";
          const strokeWidth = origBox.getAttribute("stroke-width") || "1";
          customBg.setAttribute("fill", fill);
          customBg.setAttribute("stroke", stroke);
          customBg.setAttribute("stroke-width", strokeWidth);
          customBg.setAttribute("rx", "5");
          tooltipGroup.insertBefore(customBg, tooltipGroup.firstChild);
        }

        customBg.setAttribute("x", bbox.x - 10);
        customBg.setAttribute("y", bbox.y - 10);
        customBg.setAttribute("width", bbox.width + 20);
        customBg.setAttribute("height", bbox.height + 20);
      }, 0);
    }
  }

  function processQueuedNodes() {
    scanTimeout = null;
    if (!enabled || !courseRegex) return;

    for (const node of nodesToProcess) {
      if (document.contains(node)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          normalizeCourseSplits(node);
          processNode(node);
        } else if (node.nodeType === Node.TEXT_NODE) {
          if (!isInsideSkippedElement(node)) {
            if (node.parentNode) normalizeCourseSplits(node.parentNode);
            const frag = processTextNode(node);
            if (frag && node.parentNode) {
              const parent = node.parentNode;
              parent.replaceChild(frag, node);

              let tg = parent;
              while (tg && tg !== document.documentElement) {
                if (tg.classList && tg.classList.contains('highcharts-tooltip')) break;
                tg = tg.parentNode;
              }
              if (tg && tg !== document.documentElement) {
                adjustHighchartsTooltipBackground(tg);
              }
            }
          }
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
    mode = storageData.mode || "highlight";
    const allowedSites = storageData.allowedSites || [];
    const currentHost = window.location.hostname;
    enabled = isHostAllowed(currentHost, allowedSites);

    if (!enabled || Object.keys(courses).length === 0) return;

    courseRegex = buildRegex(courses);
    injectStyles();

    const rootNode = document.body || document.documentElement;
    normalizeCourseSplits(rootNode);
    processNode(rootNode);
    startObserver();
  }

  chrome.storage.local.get(["courses", "mode", "allowedSites"], init);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TOGGLE_SITE" || message.type === "MODE_CHANGED") {
      window.location.reload();
    }
  });
})();
