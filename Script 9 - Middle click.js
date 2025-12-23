// ==UserScript==
// @name         Script 9 - Middle click opens projects in a new tab
// @namespace    http://tampermonkey.net/
// @version      6.0.0
// @description  Middle-click on a Smart View row captures the project URL (typically via window.open) and opens it in a new tab. During capture, JSF submissions and duplicate window.open calls are blocked to keep the dashboard tab in place.
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/dashboard.seam*
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/genericBrowseIFrame.seam*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Controls diagnostic output in the browser console.
   * Set to false once validation is complete.
   */
  const DEBUG = false;

  /**
   * Time window used to capture navigation attempts triggered by the click logic.
   * This window must be long enough to observe synchronous and short asynchronous handlers.
   */
  const CAPTURE_WINDOW_MS = 1400;

  /**
   * Internal flag enabling temporary blocking of same-tab navigation mechanisms.
   */
  let blockActions = false;

  const log = (...a) => DEBUG && console.log("[XTRF MiddleClick v6]", ...a);

  function normalizeUrl(href, baseWin) {
    try {
      const base = (baseWin || window).location.href;
      return new URL(href, base).toString();
    } catch {
      return null;
    }
  }

  /**
   * Determines whether an observed URL is likely to be the intended entity display target.
   * The logic is intentionally conservative to reduce false negatives.
   */
  function isLikelyTargetUrl(u) {
    if (!u) return false;
    const url = String(u);
    return (
      url.includes("/xtrf/") &&
      url.includes(".seam") &&
      (url.includes("action=display") || /[?&]id=\d+/i.test(url))
    );
  }

  /**
   * Opens a URL in a new tab using standard security flags.
   */
  function openInNewTab(url) {
    if (!url) return;
    log("Opening in new tab:", url);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function closestRow(el) {
    return el?.closest?.("tr") || null;
  }

  function closestCell(el) {
    return el?.closest?.("td,th") || null;
  }

  function shouldIgnoreTarget(target) {
    if (!target) return true;
    const tag = (target.tagName || "").toLowerCase();
    if (["input", "textarea", "select", "button", "label"].includes(tag)) return true;
    if (target.closest?.('[contenteditable="true"]')) return true;
    return false;
  }

  /**
   * Collects all same-origin window contexts (top + accessible frames).
   * Cross-origin frames are ignored to prevent security exceptions.
   */
  function getSameOriginWindows() {
    const wins = new Set();

    function addWin(w) {
      if (!w) return;
      try {
        void w.location.href;
        wins.add(w);
      } catch {
        // Cross-origin windows are intentionally ignored.
      }
    }

    addWin(window);
    addWin(window.top);

    try {
      const topWin = window.top;
      const stack = [topWin];
      while (stack.length) {
        const w = stack.pop();
        addWin(w);

        let frames;
        try { frames = w.frames; } catch { frames = null; }
        if (!frames) continue;

        for (let i = 0; i < frames.length; i++) {
          try {
            const fw = frames[i];
            addWin(fw);
            stack.push(fw);
          } catch {
            // Frame traversal failures are ignored.
          }
        }
      }
    } catch {
      // Top traversal failures are ignored.
    }

    return Array.from(wins);
  }

  /**
   * Captures a target URL by temporarily intercepting window.open while blocking JSF submission paths.
   * The function triggers the same click logic as a standard left click, then resolves with the best captured URL.
   *
   * During the capture window:
   * - window.open is blocked to avoid duplicate tabs created by the application
   * - jsfcljs and form.submit are blocked to prevent same-tab navigation
   * - submit events are cancelled (capture phase)
   */
  function captureUrlAndBlockSameTabNavigation(triggerTarget) {
    return new Promise((resolve) => {
      let captured = null;
      let done = false;

      const wins = getSameOriginWindows();
      log("Hooking same-origin windows:", wins.length);

      const cleanups = [];

      function cleanupAll() {
        while (cleanups.length) {
          const fn = cleanups.pop();
          try { fn(); } catch { /* no-op */ }
        }
      }

      function finish() {
        if (done) return;
        done = true;
        blockActions = false;
        cleanupAll();
        resolve(captured);
      }

      function record(url, baseWin, why) {
        const u = normalizeUrl(url, baseWin);
        if (!u) return;

        log("Observed:", why, u);

        // Store the first strong candidate as primary; keep fallback if needed.
        if (isLikelyTargetUrl(u)) {
          captured = captured || u;
        } else {
          captured = captured || u;
        }
      }

      // Enable blocking for the duration of the capture window.
      blockActions = true;

      // Install hooks in each same-origin window.
      for (const w of wins) {
        try {
          // Hook window.open: capture and block to prevent duplicate tabs and to avoid same-tab targets (_self).
          if (typeof w.open === "function") {
            const origOpen = w.open;
            w.open = function (url, target, features) {
              try { record(url, w, "window.open"); } catch { /* no-op */ }
              if (blockActions) return null;
              return origOpen.call(this, url, target, features);
            };
            cleanups.push(() => (w.open = origOpen));
          }

          // Hook JSF submission helper: block to prevent same-tab navigation.
          if (typeof w.jsfcljs === "function") {
            const origJsfcljs = w.jsfcljs;
            w.jsfcljs = function (form, params, target) {
              try {
                const action = form?.action || form?.getAttribute?.("action");
                record(action, w, "jsfcljs(action)");
              } catch { /* no-op */ }

              if (blockActions) return false;
              return origJsfcljs.apply(this, arguments);
            };
            cleanups.push(() => (w.jsfcljs = origJsfcljs));
          }

          // Hook form.submit: block to prevent same-tab navigation.
          if (w.HTMLFormElement && w.HTMLFormElement.prototype) {
            const origSubmit = w.HTMLFormElement.prototype.submit;
            w.HTMLFormElement.prototype.submit = function () {
              try {
                const action = this?.action || this?.getAttribute?.("action");
                record(action, w, "form.submit");
              } catch { /* no-op */ }

              if (blockActions) return;
              return origSubmit.apply(this, arguments);
            };
            cleanups.push(() => (w.HTMLFormElement.prototype.submit = origSubmit));
          }

          // Cancel submit events during capture (capture phase).
          if (w.document && w.document.addEventListener) {
            const onSubmitCapture = (ev) => {
              try {
                const form = ev?.target;
                const action = form?.action || form?.getAttribute?.("action");
                record(action, w, "submit event");
              } catch { /* no-op */ }

              if (blockActions) {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation?.();
              }
            };
            w.document.addEventListener("submit", onSubmitCapture, true);
            cleanups.push(() => w.document.removeEventListener("submit", onSubmitCapture, true));
          }
        } catch (e) {
          log("Hook install failed in one window:", e);
        }
      }

      // Safety timeout to restore original behavior.
      const t = setTimeout(finish, CAPTURE_WINDOW_MS);
      cleanups.push(() => clearTimeout(t));

      // Trigger application click logic using a synthetic left-click sequence.
      // This is required because middle click does not usually trigger the application handler.
      const cell = closestCell(triggerTarget) || triggerTarget;
      const row = closestRow(triggerTarget) || triggerTarget;

      const optsBase = { bubbles: true, cancelable: true, view: window };

      function fire(el) {
        if (!el) return;
        try { el.dispatchEvent(new MouseEvent("mousedown", { ...optsBase, button: 0, buttons: 1 })); } catch {}
        try { el.dispatchEvent(new MouseEvent("mouseup", { ...optsBase, button: 0, buttons: 0 })); } catch {}
        try { el.dispatchEvent(new MouseEvent("click", { ...optsBase, button: 0, buttons: 0 })); } catch {}
        try { typeof el.click === "function" && el.click(); } catch {}
      }

      fire(triggerTarget);
      fire(cell);
      fire(row);

      // If a strong URL was already captured synchronously, finalize immediately.
      // This reduces the probability of delayed side effects.
      if (captured && isLikelyTargetUrl(captured)) {
        setTimeout(finish, 0);
      }
    });
  }

  /**
   * Middle-click handler:
   * - Prevents default middle-click behavior (auto-scroll)
   * - Captures the project URL while blocking JSF same-tab navigation
   * - Opens exactly one new tab using the captured URL
   */
  async function onMouseDownCapture(e) {
    if (e.button !== 1) return;
    if (shouldIgnoreTarget(e.target)) return;

    const row = closestRow(e.target);
    if (!row) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    const url = await captureUrlAndBlockSameTabNavigation(e.target);

    if (url) {
      openInNewTab(url);
    } else {
      console.warn("[XTRF MiddleClick v6] No URL captured. The click action may require a trusted user click.");
    }
  }

  // Capture phase is used to run before application handlers when possible.
  document.addEventListener("mousedown", onMouseDownCapture, true);

  log("Installed v6.");
})();
