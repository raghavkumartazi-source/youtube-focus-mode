(function () {
  "use strict";

  let settings = { ...DEFAULT_SETTINGS };
  let timer = { ...DEFAULT_TIMER };

  const SHORTS_SELECTORS = [
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-reel-shelf-renderer",
    "ytd-shorts",
    "ytd-mini-guide-entry-renderer a[title='Shorts']",
    "ytd-guide-entry-renderer a[title='Shorts']",
    "a[href^='/shorts']",
    "a[href*='youtube.com/shorts']",
    "ytm-rich-shelf-renderer[is-shorts]",
    "ytm-reel-shelf-renderer",
    "ytm-shorts-card"
  ];

  const SIDEBAR_SELECTORS = [
    "ytd-watch-flexy #secondary",
    "ytd-watch-flexy #related",
    "ytd-watch-next-secondary-results-renderer",
    "ytm-watch #related",
    "ytm-single-column-watch-next-results-renderer"
  ];

  const HOME_FEED_SELECTORS = [
    "ytd-browse[page-subtype='home'] ytd-rich-grid-renderer",
    "ytd-browse[page-subtype='home'] #contents.ytd-rich-grid-renderer",
    "ytd-browse[page-subtype='home'] #primary ytd-two-column-browse-results-renderer",
    "ytd-browse[page-subtype='home'] ytd-video-renderer",
    "ytd-browse[page-subtype='home'] ytd-grid-video-renderer",
    "ytm-browse[page-subtype='home'] ytm-rich-grid-renderer",
    "ytm-home #contents.ytm-rich-grid-renderer"
  ];

  const COMMENT_SELECTORS = [
    "ytd-watch-flexy #comments",
    "ytd-comments",
    "#comments",
    "ytm-watch #comments",
    "ytm-comments"
  ];

  const GUIDE_HIDE_SELECTORS = [
    "ytd-guide-entry-renderer a[href='/shorts']",
    "ytd-mini-guide-entry-renderer a[href='/shorts']",
    "ytd-guide-entry-renderer a[href='/feed/explore']",
    "ytd-guide-entry-renderer a[href='/feed/trending']",
    "ytd-mini-guide-entry-renderer a[href='/feed/explore']",
    "ytm-guide-entry-renderer a[href='/shorts']",
    "ytm-mini-guide-entry-renderer a[href='/shorts']",
    "ytm-guide-entry-renderer a[href='/feed/explore']",
    "ytm-guide-entry-renderer a[href='/feed/trending']"
  ];

  let widgetPosition = { x: 24, y: 96 };
  let observer = null;
  let applyQueued = false;
  let hiddenThisPass = 0;
  let lastActivityTrack = Date.now();
  let lastUserActivity = Date.now();
  let lastAutoplayClick = 0;
  let lastAvoidedCreditUrl = "";
  let lastAvoidedCreditAt = 0;
  let lastUrl = location.href;
  let widget = null;
  let shadow = null;
  let widgetEls = {};
  let widgetTicker = null;
  let ambient = null;
  let ambientStarting = false;
  let ambientSignature = "";
  let quoteToastTimer = null;

  init();

  async function init() {
    const state = await getInitialState();
    settings = normalizeSettings(state.settings);
    timer = normalizeTimer(state.timer);
    widgetPosition = normalizePosition(state.widgetPosition);

    injectPageStyles();
    patchNavigationEvents();
    bindGlobalEvents();
    ensureObserver();
    ensureWidget();
    applyFocusMode();
    startActivityTracking();
    startWidgetTicker();
    syncAmbientFromSetting();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }

      if (changes[STORAGE_KEYS.settings]) {
        settings = normalizeSettings(changes[STORAGE_KEYS.settings].newValue);
        syncAmbientFromSetting();
      }
      if (changes[STORAGE_KEYS.timer]) {
        const previous = timer;
        timer = normalizeTimer(changes[STORAGE_KEYS.timer].newValue);
        // The background owns phase transitions; celebrate when one lands.
        if (previous.isRunning && previous.phase !== timer.phase) {
          playAlertTone();
          showQuoteToast(
            timer.phase === "break"
              ? timer.isLongBreak
                ? "Focus session complete. Enjoy your long break."
                : "Focus session complete. XP added."
              : "Break complete. Ready for the next focus block."
          );
        }
      }
      if (changes[STORAGE_KEYS.widgetPosition]) {
        widgetPosition = normalizePosition(changes[STORAGE_KEYS.widgetPosition].newValue);
        positionWidget();
      }

      queueApplyFocusMode();
      renderWidget();
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "YFM_TOGGLE_AMBIENT") {
        settings.ambientEnabled = Boolean(message.ambientEnabled);
        if (settings.ambientEnabled) {
          startAmbientSound();
        } else {
          stopAmbientSound();
        }
        renderWidget();
        sendResponse({ ok: true });
      }
      if (message?.type === "YFM_GET_CURRENT_CHANNEL") {
        sendResponse({
          ok: true,
          channelName: getCurrentChannelName(),
          url: location.href
        });
      }
      return false;
    });
  }

  async function getInitialState() {
    const response = await sendRuntimeMessage({ type: "YFM_GET_STATE" }).catch(() => null);
    if (response) {
      return response;
    }
    const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
    return {
      settings: stored[STORAGE_KEYS.settings],
      timer: stored[STORAGE_KEYS.timer],
      widgetPosition: stored[STORAGE_KEYS.widgetPosition]
    };
  }

  function injectPageStyles() {
    if (document.getElementById("yfm-page-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "yfm-page-style";
    style.textContent = `
      html[data-yfm-grayscale="on"] video,
      html[data-yfm-grayscale="on"] ytd-thumbnail img,
      html[data-yfm-grayscale="on"] yt-thumbnail-view-model img {
        filter: grayscale(1) !important;
      }

      html[data-yfm-study-mode="on"] ytd-rich-section-renderer:has(a[href^="/shorts"]),
      html[data-yfm-study-mode="on"] ytd-rich-item-renderer:has(a[href^="/shorts"]),
      html[data-yfm-study-mode="on"] ytd-video-renderer:has(a[href^="/shorts"]),
      html[data-yfm-study-mode="on"] ytd-compact-video-renderer:has(a[href^="/shorts"]) {
        display: none !important;
      }

      .yfm-hidden {
        display: none !important;
      }

      #yfm-home-empty-state {
        background: rgba(15, 18, 24, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        box-sizing: border-box;
        color: #f5f7fb;
        font-family: Inter, Roboto, Arial, sans-serif;
        margin: 28px auto;
        max-width: 720px;
        padding: 28px;
        text-align: center;
      }

      #yfm-home-empty-state strong {
        display: block;
        font-size: 20px;
        margin-bottom: 8px;
      }

      #yfm-home-empty-state span {
        color: #aab6c6;
        font-size: 14px;
      }

      #yfm-block-screen {
        align-items: center;
        background: rgba(8, 10, 14, 0.94);
        color: #f5f7fb;
        display: flex;
        font-family: Inter, Roboto, Arial, sans-serif;
        inset: 0;
        justify-content: center;
        padding: 24px;
        position: fixed;
        z-index: 2147483600;
      }

      #yfm-block-screen .yfm-block-card {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        box-shadow: 0 22px 80px rgba(0, 0, 0, 0.4);
        max-width: 520px;
        padding: 28px;
        text-align: center;
        width: min(100%, 520px);
      }

      #yfm-block-screen strong {
        display: block;
        font-size: 28px;
        line-height: 1.1;
        margin-bottom: 10px;
      }

      #yfm-block-screen p {
        color: #aab6c6;
        font-size: 15px;
        line-height: 1.5;
        margin: 0 0 18px;
      }

      #yfm-block-screen .yfm-block-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
      }

      #yfm-block-screen button {
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        font: 800 14px Inter, Roboto, Arial, sans-serif;
        min-height: 40px;
        padding: 0 14px;
      }

      #yfm-block-screen button:first-child {
        background: #72e4b4;
        color: #08110d;
      }

      #yfm-block-screen button:last-child {
        background: rgba(255, 255, 255, 0.11);
        color: #f5f7fb;
      }
    `;
    document.documentElement.append(style);
  }

  function patchNavigationEvents() {
    const notify = () => {
      window.dispatchEvent(new Event("yfm-location-change"));
    };

    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (original.__yfmPatched) {
        continue;
      }
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
      history[method].__yfmPatched = true;
    }

    window.addEventListener("popstate", notify);
    window.addEventListener("yt-navigate-finish", notify);
    window.addEventListener("yfm-location-change", () => {
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        queueApplyFocusMode();
      }
    });
  }

  function bindGlobalEvents() {
    for (const eventName of ["keydown", "pointerdown", "scroll", "wheel"]) {
      document.addEventListener(eventName, () => {
        lastUserActivity = Date.now();
      }, { passive: true, capture: true });
    }

    document.addEventListener(
      "click",
      (event) => {
        lastUserActivity = Date.now();
        if (!settings.studyMode || !settings.hideShorts) {
          return;
        }

        const anchor = event.target.closest?.("a[href]");
        if (!anchor || !isShortsHref(anchor.href || anchor.getAttribute("href"))) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        creditAvoidedTime(5 * 60 * 1000);
        if (settings.blockScreen) {
          ensureBlockScreen("Shorts are blocked in Study Mode.", "Open a study video from search or subscriptions instead.");
        } else {
          showQuoteToast("Shorts blocked. Stay in study mode.");
        }
      },
      true
    );

    document.addEventListener("visibilitychange", () => {
      lastActivityTrack = Date.now();
    });
  }

  function ensureObserver() {
    if (observer) {
      return;
    }

    observer = new MutationObserver(queueApplyFocusMode);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function queueApplyFocusMode() {
    if (applyQueued) {
      return;
    }
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      applyFocusMode();
    });
  }

  function applyFocusMode() {
    // Pause the observer while we mutate the DOM so our own class and
    // attribute changes cannot retrigger the hide pass in a hot loop.
    if (observer) {
      observer.disconnect();
    }

    try {
      document.documentElement.dataset.yfmStudyMode = settings.studyMode ? "on" : "off";
      document.documentElement.dataset.yfmGrayscale = settings.studyMode && settings.grayscale ? "on" : "off";

      if (!settings.studyMode) {
        restoreHiddenElements();
        removeHomeEmptyState();
        removeBlockScreen();
        updateWidgetVisibility();
        return;
      }

      restoreHiddenElements();
      hiddenThisPass = 0;
      const currentWhitelisted = isCurrentChannelWhitelisted();

      if (handleBlockedPage()) {
        updateWidgetVisibility();
        return;
      }

      removeBlockScreen();

      if (settings.hideShorts) {
        hideShorts();
      }

      hideGuideDistractions();

      if (settings.hideSidebar && !currentWhitelisted) {
        hideSelectors(SIDEBAR_SELECTORS, "sidebar");
      }

      if (settings.hideHomeFeed) {
        hideHomeFeed();
      } else {
        removeHomeEmptyState();
      }

      if (settings.hideComments && !currentWhitelisted) {
        hideSelectors(COMMENT_SELECTORS, "comments");
      }

      if (settings.blockAutoplay && !currentWhitelisted) {
        blockAutoplay();
      }

      updateWidgetVisibility();
    } finally {
      if (observer) {
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    }
  }

  function hideShorts() {
    for (const selector of SHORTS_SELECTORS) {
      for (const node of document.querySelectorAll(selector)) {
        const container = getMeaningfulContainer(node);
        hideElement(container || node, "shorts");
      }
    }
  }

  function hideGuideDistractions() {
    for (const selector of GUIDE_HIDE_SELECTORS) {
      for (const node of document.querySelectorAll(selector)) {
        const container = node.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, tp-yt-paper-item") || node;
        hideElement(container, "guide");
      }
    }
  }

  function hideHomeFeed() {
    if (!isHomePage()) {
      removeHomeEmptyState();
      return;
    }

    hideSelectors(HOME_FEED_SELECTORS, "home-feed");
    ensureHomeEmptyState();
  }

  function hideSelectors(selectors, reason) {
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        hideElement(node, reason);
      }
    }
  }

  function hideElement(element, reason) {
    if (!element || element.id === "yfm-focus-widget-host" || element.dataset.yfmHidden === reason) {
      return;
    }
    element.dataset.yfmHidden = reason;
    element.classList.add("yfm-hidden");
    hiddenThisPass += 1;
  }

  function restoreHiddenElements() {
    for (const node of document.querySelectorAll("[data-yfm-hidden]")) {
      node.classList.remove("yfm-hidden");
      delete node.dataset.yfmHidden;
    }
  }

  function getMeaningfulContainer(node) {
    return node.closest(
      [
        "ytd-rich-item-renderer",
        "ytd-rich-section-renderer",
        "ytd-video-renderer",
        "ytd-grid-video-renderer",
        "ytd-compact-video-renderer",
        "ytd-reel-shelf-renderer",
        "ytd-guide-entry-renderer",
        "ytd-mini-guide-entry-renderer",
        "tp-yt-paper-item"
      ].join(", ")
    );
  }

  function handleBlockedPage() {
    if (settings.hideShorts && isShortsHref(location.href)) {
      creditAvoidedTime(5 * 60 * 1000);
      if (settings.blockScreen) {
        ensureBlockScreen("Shorts are blocked in Study Mode.", "Open subscriptions or search for the lesson you came to watch.");
      } else {
        showQuoteToast("Shorts blocked. Opening subscriptions.");
        location.replace("/feed/subscriptions");
      }
      return true;
    }

    if (settings.strictMode && isStrictBlockedPage()) {
      creditAvoidedTime(3 * 60 * 1000);
      ensureBlockScreen("Strict Mode is protecting your focus.", "Only search, subscriptions, and the current video stay available.");
      return true;
    }

    return false;
  }

  function blockAutoplay() {
    const now = Date.now();
    // Long cooldown: YouTube updates the toggle asynchronously, and clicking
    // again too soon could flip a freshly disabled toggle back on.
    if (now - lastAutoplayClick < 15000) {
      return;
    }

    const candidates = [
      ".ytp-autonav-toggle-button[aria-checked='true']",
      ".ytp-autonav-toggle-button[aria-label*='on' i]",
      "button[aria-label*='Autoplay is on' i]"
    ];

    for (const selector of candidates) {
      const button = document.querySelector(selector);
      if (button && isVisible(button)) {
        button.click();
        lastAutoplayClick = now;
        return;
      }
    }
  }

  function ensureHomeEmptyState() {
    if (document.getElementById("yfm-home-empty-state")) {
      return;
    }

    const primary = document.querySelector("ytd-browse[page-subtype='home'] #primary") || document.querySelector("ytd-browse[page-subtype='home']");
    if (!primary) {
      return;
    }

    const empty = document.createElement("div");
    empty.id = "yfm-home-empty-state";
    empty.innerHTML = "<strong>Focus Mode is on</strong><span>Use search or open Subscriptions to continue studying.</span>";
    primary.prepend(empty);
  }

  function removeHomeEmptyState() {
    document.getElementById("yfm-home-empty-state")?.remove();
  }

  function ensureBlockScreen(title, body) {
    pausePlayingVideo();
    let screen = document.getElementById("yfm-block-screen");
    if (!screen) {
      screen = document.createElement("div");
      screen.id = "yfm-block-screen";
      screen.innerHTML = `
        <div class="yfm-block-card">
          <strong data-title></strong>
          <p data-body></p>
          <div class="yfm-block-actions">
            <button type="button" data-subscriptions>Open Subscriptions</button>
            <button type="button" data-search>Use Search</button>
          </div>
        </div>
      `;
      screen.querySelector("[data-subscriptions]").addEventListener("click", () => {
        location.href = "/feed/subscriptions";
      });
      screen.querySelector("[data-search]").addEventListener("click", () => {
        location.href = "/results?search_query=";
      });
      document.documentElement.append(screen);
    }

    const titleNode = screen.querySelector("[data-title]");
    const bodyNode = screen.querySelector("[data-body]");
    if (titleNode.textContent !== title) {
      titleNode.textContent = title;
    }
    if (bodyNode.textContent !== body) {
      bodyNode.textContent = body;
    }
  }

  function removeBlockScreen() {
    document.getElementById("yfm-block-screen")?.remove();
  }

  function pausePlayingVideo() {
    const video = document.querySelector("video");
    if (video && !video.paused) {
      video.pause();
    }
  }

  function isCurrentChannelWhitelisted() {
    if (!settings.whitelistChannels.length) {
      return false;
    }

    const channelName = getCurrentChannelName();
    if (!channelName) {
      return false;
    }

    const cleanChannel = normalizeChannelName(channelName);
    return settings.whitelistChannels.some((channel) => normalizeChannelName(channel) === cleanChannel);
  }

  function getCurrentChannelName() {
    const selectors = [
      "ytd-video-owner-renderer #channel-name a",
      "ytd-video-owner-renderer ytd-channel-name a",
      "#owner #channel-name a",
      "ytd-channel-name a"
    ];

    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent;
      if (value && value.trim() && !looksLikeChannelId(value.trim())) {
        return value.trim();
      }
    }

    return "";
  }

  function looksLikeChannelId(value) {
    return /^UC[A-Za-z0-9_-]{22}$/.test(value);
  }

  function isHomePage() {
    return location.pathname === "/" || location.pathname === "";
  }

  function isStrictBlockedPage() {
    const blockedPaths = [
      "/",
      "/feed/explore",
      "/feed/trending",
      "/gaming",
      "/podcasts",
      "/shopping"
    ];
    return blockedPaths.includes(location.pathname);
  }

  function isShortsHref(value) {
    try {
      const url = new URL(value, location.origin);
      return url.pathname.startsWith("/shorts");
    } catch (_error) {
      return String(value || "").startsWith("/shorts");
    }
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function ensureWidget() {
    if (widget) {
      return;
    }

    widget = document.createElement("div");
    widget.id = "yfm-focus-widget-host";
    shadow = widget.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          color-scheme: dark;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .widget {
          backdrop-filter: blur(20px);
          background: rgba(7, 9, 13, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 10px;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(114, 228, 180, 0.08);
          box-sizing: border-box;
          color: #f2f6fc;
          min-width: 236px;
          overflow: hidden;
          user-select: none;
        }

        .head {
          align-items: center;
          cursor: grab;
          display: flex;
          gap: 10px;
          justify-content: space-between;
          padding: 11px 12px 8px;
        }

        .head:active {
          cursor: grabbing;
        }

        .label {
          color: #72e4b4;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .mode {
          background: rgba(114, 228, 180, 0.14);
          border: 1px solid rgba(114, 228, 180, 0.25);
          border-radius: 999px;
          color: #b9f8dc;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 8px;
        }

        .head-close {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 6px;
          color: #aab6c6;
          cursor: pointer;
          display: inline-flex;
          font-size: 16px;
          height: 24px;
          justify-content: center;
          line-height: 1;
          padding: 0;
          transition: color 160ms ease, background 160ms ease;
          width: 24px;
        }

        .head-close:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #f5f7fb;
        }

        .body {
          padding: 0 12px 12px;
        }

        .timer-face {
          align-items: center;
          display: flex;
          gap: 11px;
          margin: 2px 0 10px;
        }

        .ring {
          display: grid;
          flex: 0 0 54px;
          height: 54px;
          place-items: center;
          position: relative;
          width: 54px;
        }

        .ring svg {
          height: 54px;
          transform: rotate(-90deg);
          width: 54px;
        }

        .ring circle {
          fill: none;
          stroke-width: 9;
        }

        .ring-bg {
          stroke: rgba(255, 255, 255, 0.12);
        }

        .ring-fg {
          stroke: #72e4b4;
          stroke-dasharray: 276.46;
          stroke-dashoffset: 0;
          stroke-linecap: round;
          filter: drop-shadow(0 0 5px rgba(114, 228, 180, 0.55));
          transition: stroke-dashoffset 220ms ease;
        }

        .ring span {
          color: #aab6c6;
          font-size: 10px;
          font-weight: 900;
          position: absolute;
        }

        .time {
          display: block;
          font-size: 34px;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1;
        }

        .quote {
          color: #aab6c6;
          font-size: 12px;
          line-height: 1.35;
          margin: 0 0 12px;
          max-width: 212px;
        }

        .actions {
          display: grid;
          gap: 8px;
          grid-template-columns: 1fr 34px 34px;
        }

        button {
          align-items: center;
          border: 0;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          font: inherit;
          font-weight: 900;
          height: 34px;
          justify-content: center;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
        }

        button:hover {
          transform: translateY(-1px);
        }

        .primary {
          background: #72e4b4;
          color: #08110d;
        }

        .icon {
          background: rgba(255, 255, 255, 0.11);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #f5f7fb;
          font-size: 16px;
        }

        .icon.active {
          background: rgba(114, 228, 180, 0.19);
          border-color: rgba(114, 228, 180, 0.46);
          color: #72e4b4;
        }

        .toast {
          background: rgba(12, 15, 20, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          bottom: calc(100% + 10px);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
          color: #f5f7fb;
          display: none;
          font-size: 12px;
          left: 0;
          line-height: 1.35;
          padding: 10px;
          position: absolute;
          right: 0;
        }

        .toast.show {
          display: block;
          animation: yfmFade 220ms ease;
        }

        @keyframes yfmFade {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 520px) {
          .widget {
            min-width: 212px;
          }

          .time {
            font-size: 30px;
          }
        }
      </style>
      <div class="widget" part="widget">
        <div class="toast" data-toast></div>
        <div class="head" data-drag-handle>
          <span class="label">YouTube Focus</span>
          <span class="mode" data-phase>Focus</span>
          <button class="head-close" type="button" data-close title="Hide widget" aria-label="Hide focus widget">×</button>
        </div>
        <div class="body">
          <div class="timer-face">
            <div class="ring" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <circle class="ring-bg" cx="50" cy="50" r="44"></circle>
                <circle class="ring-fg" data-progress cx="50" cy="50" r="44"></circle>
              </svg>
              <span data-progress-label>100%</span>
            </div>
            <strong class="time" data-time>25:00</strong>
          </div>
          <p class="quote" data-quote>Stay with the lesson.</p>          <div class="actions">
            <button class="primary" type="button" data-start>Start</button>
            <button class="icon" type="button" data-reset title="Reset timer" aria-label="Reset timer">↻</button>
            <button class="icon" type="button" data-ambient title="Ambient sound" aria-label="Ambient sound">♪</button>
          </div>
        </div>
      </div>
    `;

    widget.style.position = "fixed";
    widget.style.zIndex = "2147483647";
    widget.style.display = "none";
    document.documentElement.append(widget);

    widgetEls = {
      phase: shadow.querySelector("[data-phase]"),
      time: shadow.querySelector("[data-time]"),
      progress: shadow.querySelector("[data-progress]"),
      progressLabel: shadow.querySelector("[data-progress-label]"),
      quote: shadow.querySelector("[data-quote]"),
      start: shadow.querySelector("[data-start]"),
      reset: shadow.querySelector("[data-reset]"),
      ambient: shadow.querySelector("[data-ambient]"),
      toast: shadow.querySelector("[data-toast]"),
      handle: shadow.querySelector("[data-drag-handle]"),
      close: shadow.querySelector("[data-close]")
    };

    widgetEls.start.addEventListener("click", () => {
      if (timer.isRunning) {
        pauseTimer();
      } else {
        startTimer();
      }
    });
    widgetEls.reset.addEventListener("click", resetTimer);
    widgetEls.ambient.addEventListener("click", toggleAmbient);

    // The close button lives inside the drag handle, so it must swallow the
    // pointer event or dragging starts the moment you reach for it.
    widgetEls.close.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    widgetEls.close.addEventListener("click", hideWidget);
    bindWidgetDrag();
    positionWidget();
    renderWidget();
    updateWidgetVisibility();
  }

  function bindWidgetDrag() {
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let dragging = false;

    widgetEls.handle.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = widgetPosition.x;
      originY = widgetPosition.y;
      widgetEls.handle.setPointerCapture(event.pointerId);
    });

    widgetEls.handle.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      widgetPosition = clampPosition({
        x: originX + event.clientX - startX,
        y: originY + event.clientY - startY
      });
      positionWidget();
    });

    widgetEls.handle.addEventListener("pointerup", (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      widgetEls.handle.releasePointerCapture(event.pointerId);
      chrome.storage.local.set({ [STORAGE_KEYS.widgetPosition]: widgetPosition });
    });
  }

  function positionWidget() {
    if (!widget) {
      return;
    }
    const next = clampPosition(widgetPosition);
    widget.style.left = `${next.x}px`;
    widget.style.top = `${next.y}px`;
  }

  function clampPosition(position) {
    const width = widget?.offsetWidth || 250;
    const height = widget?.offsetHeight || 160;
    return {
      x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(position.y, window.innerHeight - height - 8))
    };
  }

  function updateWidgetVisibility() {
    if (!widget) {
      return;
    }
    widget.style.display = settings.studyMode && settings.widgetEnabled ? "block" : "none";
  }

  async function hideWidget() {
    settings = normalizeSettings({ ...settings, widgetEnabled: false });
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
    updateWidgetVisibility();
  }

  function startWidgetTicker() {
    if (widgetTicker) {
      clearInterval(widgetTicker);
    }
    widgetTicker = setInterval(() => {
      checkTimerExpiry();
      renderWidget();
    }, 1000);
  }

  function renderWidget() {
    if (!widget) {
      return;
    }
    const remainingMs = getTimerRemainingMs(timer);
    const durationMs = Math.max(1, timer.durationMs || getPhaseDuration(timer, timer.phase));
    const progress = Math.max(0, Math.min(1, remainingMs / durationMs));
    const circumference = 2 * Math.PI * 44;
    widgetEls.phase.textContent = getPhaseLabel(timer);
    widgetEls.time.textContent = formatClock(remainingMs);
    widgetEls.start.textContent = timer.isRunning ? "Pause" : "Start";
    widgetEls.quote.textContent = getWidgetQuote();
    widgetEls.ambient.classList.toggle("active", settings.ambientEnabled);
    widgetEls.progress.style.strokeDasharray = String(circumference);
    widgetEls.progress.style.strokeDashoffset = String(circumference * (1 - progress));
    widgetEls.progressLabel.textContent = `${Math.round(progress * 100)}%`;
  }

  async function startTimer() {
    timer = buildStartedTimer(timer);
    await chrome.storage.local.set({ [STORAGE_KEYS.timer]: timer });
    renderWidget();
  }

  async function pauseTimer() {
    timer = buildPausedTimer(timer);
    await chrome.storage.local.set({ [STORAGE_KEYS.timer]: timer });
    renderWidget();
  }

  async function resetTimer() {
    timer = buildResetTimer(timer);
    await chrome.storage.local.set({ [STORAGE_KEYS.timer]: timer });
    renderWidget();
  }

  function checkTimerExpiry() {
    if (!timer.isRunning || getTimerRemainingMs(timer) > 0) {
      return;
    }
    // The background worker owns phase transitions; it dedupes by session id.
    sendRuntimeMessage({ type: "YFM_TIMER_EXPIRED", sessionId: timer.sessionId }).catch(() => null);
  }

  // Credits distraction-avoided time at most once per page visit (and at
  // most every 5 minutes on the same URL) so a chatty DOM cannot inflate
  // the avoided-time stat.
  function creditAvoidedTime(ms) {
    const now = Date.now();
    if (location.href === lastAvoidedCreditUrl && now - lastAvoidedCreditAt < 5 * 60 * 1000) {
      return;
    }
    lastAvoidedCreditUrl = location.href;
    lastAvoidedCreditAt = now;
    trackActivity(0, ms);
  }

  async function toggleAmbient() {
    const ambientEnabled = !settings.ambientEnabled;
    settings = normalizeSettings({ ...settings, ambientEnabled });
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
    if (ambientEnabled) {
      startAmbientSound();
    } else {
      stopAmbientSound();
    }
    renderWidget();
  }

  function syncAmbientFromSetting() {
    const nextSignature = `${settings.ambientSound}:${settings.ambientVolume}`;
    if (ambient && ambientSignature !== nextSignature) {
      stopAmbientSound();
      ambient = null;
    }

    if (settings.ambientEnabled) {
      startAmbientSound();
    } else {
      stopAmbientSound();
    }
  }

  async function startAmbientSound() {
    if (ambientStarting) {
      return;
    }

    ambientStarting = true;
    try {
      if (!ambient) {
        ambient = createAmbientSound();
        ambientSignature = `${settings.ambientSound}:${settings.ambientVolume}`;
      }
      await ambient.start();
    } catch (_error) {
      settings.ambientEnabled = false;
      chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
      showQuoteToast("Click the sound button again to start ambient audio.");
    } finally {
      ambientStarting = false;
    }
  }

  function stopAmbientSound() {
    ambient?.stop();
    ambient = null;
  }

  function createAmbientSound() {
    const context = new AudioContext();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const toneGain = context.createGain();
    const tone = context.createOscillator();
    const bufferSize = context.sampleRate * 2;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    let source = null;

    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }

    const volume = Math.max(0, Math.min(settings.ambientVolume, 100)) / 100;
    gain.gain.value = 0.01 + volume * 0.08;
    configureAmbientFilter(filter, tone, toneGain);
    filter.connect(gain);
    tone.connect(toneGain);
    toneGain.connect(gain);
    gain.connect(context.destination);

    return {
      async start() {
        if (context.state === "suspended") {
          await context.resume();
        }
        if (source) {
          return;
        }
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(filter);
        source.start();
        if (toneGain.gain.value > 0) {
          tone.start();
        }
      },
      stop() {
        if (source) {
          source.stop();
          source.disconnect();
          source = null;
        }
        source = null;
        try {
          tone.stop();
        } catch (_error) {
          // Oscillators can only be stopped once.
        }
        context.close?.();
      }
    };
  }

  function configureAmbientFilter(filter, tone, toneGain) {
    toneGain.gain.value = 0;

    if (settings.ambientSound === "white-noise") {
      filter.type = "highpass";
      filter.frequency.value = 80;
      filter.Q.value = 0.2;
      return;
    }

    if (settings.ambientSound === "cafe") {
      filter.type = "bandpass";
      filter.frequency.value = 360;
      filter.Q.value = 0.45;
      tone.type = "sine";
      tone.frequency.value = 118;
      toneGain.gain.value = 0.006;
      return;
    }

    if (settings.ambientSound === "forest") {
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.9;
      tone.type = "triangle";
      tone.frequency.value = 310;
      toneGain.gain.value = 0.003;
      return;
    }

    filter.type = "lowpass";
    filter.frequency.value = 950;
    filter.Q.value = 0.7;
  }

  function playAlertTone() {
    if (!settings.soundAlerts) {
      return;
    }

    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      // Fires after the background advanced the phase, so "break" means a
      // focus session just completed (higher chime).
      oscillator.frequency.value = timer.phase === "break" ? 740 : 520;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.48);
    } catch (_error) {
      // Audio alerts depend on browser gesture rules; visual notifications still work.
    }
  }

  function startActivityTracking() {
    setInterval(() => {
      if (document.hidden || !settings.studyMode) {
        lastActivityTrack = Date.now();
        return;
      }

      const now = Date.now();
      const delta = Math.min(now - lastActivityTrack, 30 * 1000);
      lastActivityTrack = now;

      if (delta < 1000) {
        return;
      }

      const focusTimerRunning = timer.isRunning && timer.phase === "focus";
      const engaged = isStudyPlaybackActive() || wasRecentlyActive();
      const studyMs = focusTimerRunning || !engaged ? 0 : delta;
      const avoidedMs = engaged && hiddenThisPass > 0
        ? Math.min(delta, Math.round(delta * 0.35 + hiddenThisPass * 150))
        : 0;

      if (studyMs || avoidedMs) {
        trackActivity(studyMs, avoidedMs);
      }
    }, 15000);
  }

  function trackActivity(studyMs, avoidedMs) {
    sendRuntimeMessage({
      type: "YFM_TRACK_ACTIVITY",
      studyMs,
      avoidedMs
    }).catch(() => null);
  }

  function isStudyPlaybackActive() {
    const video = document.querySelector("video");
    return Boolean(video && !video.paused && !video.ended && video.readyState >= 2);
  }

  function wasRecentlyActive() {
    return Date.now() - lastUserActivity < 5 * 60 * 1000;
  }

  function showQuoteToast(message) {
    if (!widgetEls.toast) {
      return;
    }
    widgetEls.toast.textContent = message || getWidgetQuote();
    widgetEls.toast.classList.add("show");
    clearTimeout(quoteToastTimer);
    quoteToastTimer = setTimeout(() => {
      widgetEls.toast.classList.remove("show");
    }, 3500);
  }
})();
