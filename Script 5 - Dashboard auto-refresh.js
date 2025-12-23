// ==UserScript==
// @name         Script 5 - XTRF Auto Refresh Dashboard
// @namespace    http://tampermonkey.net/
// @version      2.4.0
// @description  Manual + auto refresh for Smart Views (genericBrowseIFrame). No hover targeting. Buttons are cloned from the top toolbar for perfect alignment. Auto button shows a small dot when enabled. No badge.
// @match        https://translations.myelan.net/xtrf/faces/dashboard2/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /* -----------------------------
     CONFIG
  ----------------------------- */

  const STORAGE_KEY = "xtrf_sv_refresh_cfg_v6";
  const DEFAULT_CFG = { enabled: false, value: 60, unit: "s" }; // 60 seconds
  const MIN_SECONDS = 5;

  const REFRESH_GAP_MS = 450; // sequential delay between iframe reloads
  const RESCAN_MS = 700;

  const BTN_MANUAL_ID = "xtrf_sv_manual_refresh";
  const BTN_AUTO_ID = "xtrf_sv_auto_refresh";
  const PANEL_ID = "xtrf_sv_auto_panel";

  let cfg = loadCfg();
  let autoTimer = null;

  let panelEl = null;
  let autoBtn = null;
  let manualBtn = null;

  /* -----------------------------
     UTILS
  ----------------------------- */

  function normalize(s) {
    return (s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }

  function loadCfg() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_CFG, ...JSON.parse(raw) } : { ...DEFAULT_CFG };
    } catch (_) {
      return { ...DEFAULT_CFG };
    }
  }

  function saveCfg() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function secondsFromCfg() {
    let s = Number(cfg.value || 0);
    if (!Number.isFinite(s)) s = DEFAULT_CFG.value;
    if (cfg.unit === "m") s = s * 60;
    s = Math.max(MIN_SECONDS, Math.floor(s));
    return s;
  }

  /* -----------------------------
     SMART VIEW IFRAME TARGETING
  ----------------------------- */

  function isSmartViewIframe(iframe) {
    const src = (iframe.getAttribute("src") || "").toLowerCase();
    return src.includes("genericbrowseiframe.seam");
  }

  function getSmartViewIframes(scopeEl = document) {
    return Array.from(scopeEl.querySelectorAll("iframe")).filter(isSmartViewIframe);
  }

  function reloadIframe(iframe) {
    try {
      iframe.contentWindow.location.reload();
      return;
    } catch (_) {}

    try {
      const src = iframe.getAttribute("src");
      if (src) iframe.setAttribute("src", src);
    } catch (_) {}
  }

  async function reloadIframesSequential(iframes) {
    for (const iframe of iframes) {
      reloadIframe(iframe);
      await new Promise((r) => setTimeout(r, REFRESH_GAP_MS));
    }
  }

  /* -----------------------------
     TOP TOOLBAR (clone positioning like Script 7)
  ----------------------------- */

  function findEditDashboardButton() {
    return (
      Array.from(document.querySelectorAll("button, a")).find(
        (el) => normalize(el.textContent).toLowerCase() === "edit dashboard"
      ) || null
    );
  }

  function findTopButtonsContainer() {
    const editBtn = findEditDashboardButton();
    if (!editBtn) return null;
    return editBtn.parentElement || null;
  }

  function pickTemplateButton(container) {
    const buttons = Array.from(container.querySelectorAll("button, a"));
    const editBtn = findEditDashboardButton();

    // Prefer a "small" icon-like button (short text), else any sibling, else Edit itself.
    const small = buttons.find((b) => {
      const txt = normalize(b.textContent);
      return b !== editBtn && txt.length <= 3;
    });

    return small || buttons.find((b) => b !== editBtn) || editBtn || null;
  }

  function makeClonedIconButton(templateBtn, id, title, iconText, onClick) {
    const btn = templateBtn.cloneNode(true);

    btn.id = id;
    btn.setAttribute("title", title);

    // Prevent any original behavior
    btn.removeAttribute("onclick");
    btn.removeAttribute("ng-click");
    btn.removeAttribute("href");
    btn.type = "button";

    // Replace visible content with our icon (keeps original padding/structure)
    btn.textContent = "";
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.justifyContent = "center";
    span.style.width = "100%";
    span.style.height = "100%";
    span.textContent = iconText;
    btn.appendChild(span);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(span);
    });

    return btn;
  }

  function setAutoIcon(autoSpan) {
    autoSpan.textContent = cfg.enabled ? "⏱️•" : "⏱️";
  }

  /* -----------------------------
     PANEL (auto settings)
  ----------------------------- */

  function ensurePanelStyles() {
    if (document.getElementById("xtrf_sv_panel_style")) return;

    const style = document.createElement("style");
    style.id = "xtrf_sv_panel_style";
    style.textContent = `
      #${PANEL_ID}{
        position: fixed;
        z-index: 999999;
        background: #fff;
        border: 1px solid rgba(0,0,0,0.15);
        border-radius: 10px;
        box-shadow: 0 10px 24px rgba(0,0,0,0.18);
        padding: 10px 10px 8px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        font-size: 12px;
        min-width: 230px;
        display: none;
      }
      #${PANEL_ID} .row{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin-bottom:8px;
      }
      #${PANEL_ID} .close{
        border:none;
        background:transparent;
        cursor:pointer;
        font-size:14px;
        line-height:1;
      }
      #${PANEL_ID} input[type="number"], #${PANEL_ID} select{
        padding:6px 8px;
        border:1px solid rgba(0,0,0,0.2);
        border-radius:8px;
        font-size:12px;
      }
      #${PANEL_ID} input[type="number"]{ width:88px; }
      #${PANEL_ID} .muted{
        color: rgba(0,0,0,0.65);
        line-height: 1.25;
      }
    `;
    document.head.appendChild(style);
  }

  function clampPanelToViewport(panel, anchorRect) {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left;
    let top = anchorRect.bottom + 8;

    panel.style.left = "0px";
    panel.style.top = "0px";
    panel.style.visibility = "hidden";
    panel.style.display = "block";

    const r = panel.getBoundingClientRect();
    const w = r.width;
    const h = r.height;

    if (left + w + pad > vw) left = Math.max(pad, anchorRect.right - w);
    if (top + h + pad > vh) top = Math.max(pad, anchorRect.top - h - 8);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = "visible";
  }

  function buildPanel(anchorBtn, autoSpan) {
    ensurePanelStyles();

    if (panelEl) panelEl.remove();

    panelEl = document.createElement("div");
    panelEl.id = PANEL_ID;

    panelEl.innerHTML = `
      <div class="row">
        <div style="font-weight:600;">Auto-refresh</div>
        <button class="close" type="button" title="Close">✕</button>
      </div>

      <label class="row" style="justify-content:flex-start;">
        <input id="xtrf_sv_enable" type="checkbox" />
        <span>Enable</span>
      </label>

      <div class="row" style="justify-content:flex-start;">
        <input id="xtrf_sv_value" type="number" min="${MIN_SECONDS}" step="1" />
        <select id="xtrf_sv_unit">
          <option value="s">seconds</option>
          <option value="m">minutes</option>
        </select>
      </div>

      <div class="muted">Choose the interval for the automatic refresh.</div>
    `;

    document.body.appendChild(panelEl);

    const closeBtn = panelEl.querySelector(".close");
    const enableCb = panelEl.querySelector("#xtrf_sv_enable");
    const valueIn = panelEl.querySelector("#xtrf_sv_value");
    const unitSel = panelEl.querySelector("#xtrf_sv_unit");

    enableCb.checked = !!cfg.enabled;
    valueIn.value = cfg.value;
    unitSel.value = cfg.unit;

    closeBtn.addEventListener("click", () => (panelEl.style.display = "none"));

    function applyCfg() {
      cfg.value = Math.max(MIN_SECONDS, Number(valueIn.value || MIN_SECONDS));
      cfg.unit = unitSel.value === "m" ? "m" : "s";
      const want = enableCb.checked;

      saveCfg();

      if (want) startAuto();
      else stopAuto();

      setAutoIcon(autoSpan);
      anchorBtn.title = cfg.enabled ? `Auto-refresh ON (${secondsFromCfg()}s)` : "Auto-refresh settings";
    }

    enableCb.addEventListener("change", applyCfg);
    valueIn.addEventListener("change", applyCfg);
    unitSel.addEventListener("change", applyCfg);

    // outside click closes panel
    setTimeout(() => {
      document.addEventListener("mousedown", (e) => {
        if (!panelEl || panelEl.style.display === "none") return;
        if (panelEl.contains(e.target)) return;
        if (anchorBtn.contains(e.target)) return;
        panelEl.style.display = "none";
      });
    }, 0);
  }

  /* -----------------------------
     AUTO REFRESH
  ----------------------------- */

  function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    cfg.enabled = false;
    saveCfg();
  }

  function startAuto() {
    stopAuto();
    cfg.enabled = true;
    saveCfg();

    const tick = async () => {
      const targets = getSmartViewIframes(document);
      if (!targets.length) return;

      await reloadIframesSequential(targets);

      // Safety: stop if "View has expired" appears (avoids loops)
      try {
        for (const iframe of targets) {
          const bodyText = (iframe.contentDocument?.body?.innerText || "").toLowerCase();
          if (bodyText.includes("view has expired")) {
            stopAuto();
            break;
          }
        }
      } catch (_) {}
    };

    autoTimer = setInterval(tick, secondsFromCfg() * 1000);
  }

  /* -----------------------------
     INSERT BUTTONS
  ----------------------------- */

  function insertButtons() {
    const container = findTopButtonsContainer();
    if (!container) return false;

    if (document.getElementById(BTN_MANUAL_ID) || document.getElementById(BTN_AUTO_ID)) return true;

    const templateBtn = pickTemplateButton(container);
    if (!templateBtn) return false;

    // Manual refresh
    manualBtn = makeClonedIconButton(
      templateBtn,
      BTN_MANUAL_ID,
      "Refresh all Smart Views",
      "↻",
      async () => {
        if (manualBtn.disabled) return;
        manualBtn.disabled = true;
        try {
          const targets = getSmartViewIframes(document);
          await reloadIframesSequential(targets);
        } finally {
          setTimeout(() => (manualBtn.disabled = false), 350);
        }
      }
    );

    // Auto refresh button (icon shows dot when enabled)
    autoBtn = makeClonedIconButton(
      templateBtn,
      BTN_AUTO_ID,
      "Auto-refresh settings",
      cfg.enabled ? "⏱️•" : "⏱️",
      (autoSpan) => {
        if (!panelEl) buildPanel(autoBtn, autoSpan);

        panelEl.style.display = panelEl.style.display === "none" ? "block" : "none";
        if (panelEl.style.display === "block") {
          clampPanelToViewport(panelEl, autoBtn.getBoundingClientRect());
        }

        setAutoIcon(autoSpan);
        autoBtn.title = cfg.enabled ? `Auto-refresh ON (${secondsFromCfg()}s)` : "Auto-refresh settings";
      }
    );

    // Insert right after the last existing toolbar button (keeps order clean)
    container.appendChild(manualBtn);
    container.appendChild(autoBtn);

    // Restore auto if enabled
    const autoSpan = autoBtn.querySelector("span");
    if (autoSpan) setAutoIcon(autoSpan);
    if (cfg.enabled) startAuto();

    return true;
  }

  /* -----------------------------
     BOOT
  ----------------------------- */

  function boot() {
    const t = setInterval(() => {
      const ok = insertButtons();
      if (ok) clearInterval(t);
    }, RESCAN_MS);
  }

  boot();
})();
