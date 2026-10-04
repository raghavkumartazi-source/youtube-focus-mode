const state = {
  settings: { ...DEFAULT_SETTINGS },
  stats: { ...DEFAULT_STATS },
  timer: { ...DEFAULT_TIMER }
};

const els = {
  studyModeToggle: document.getElementById("studyModeToggle"),
  openOptionsBtn: document.getElementById("openOptionsBtn"),
  modeLabel: document.getElementById("modeLabel"),
  quoteText: document.getElementById("quoteText"),
  timerPhase: document.getElementById("timerPhase"),
  timerDisplay: document.getElementById("timerDisplay"),
  timerProgressCircle: document.getElementById("timerProgressCircle"),
  timerProgressLabel: document.getElementById("timerProgressLabel"),
  startPauseBtn: document.getElementById("startPauseBtn"),
  resetTimerBtn: document.getElementById("resetTimerBtn"),
  ambientBtn: document.getElementById("ambientBtn"),
  studyTimeToday: document.getElementById("studyTimeToday"),
  avoidedTimeToday: document.getElementById("avoidedTimeToday"),
  streakCount: document.getElementById("streakCount"),
  xpCount: document.getElementById("xpCount"),
  levelNumber: document.getElementById("levelNumber"),
  levelProgressLabel: document.getElementById("levelProgressLabel"),
  levelBar: document.getElementById("levelBar"),
  sessionReport: document.getElementById("sessionReport"),
  sessionReportTime: document.getElementById("sessionReportTime"),
  reportDuration: document.getElementById("reportDuration"),
  reportXp: document.getElementById("reportXp"),
  reportGoal: document.getElementById("reportGoal"),
  syncStatus: document.getElementById("syncStatus"),
  grayscale: document.getElementById("grayscale"),
  hideShorts: document.getElementById("hideShorts"),
  hideSidebar: document.getElementById("hideSidebar"),
  hideHomeFeed: document.getElementById("hideHomeFeed"),
  blockAutoplay: document.getElementById("blockAutoplay"),
  hideComments: document.getElementById("hideComments"),
  strictMode: document.getElementById("strictMode"),
  widgetEnabled: document.getElementById("widgetEnabled"),
  whitelistCurrentBtn: document.getElementById("whitelistCurrentBtn"),
  whitelistForm: document.getElementById("whitelistForm"),
  channelInput: document.getElementById("channelInput"),
  whitelistList: document.getElementById("whitelistList"),
  widgetHiddenPanel: document.getElementById("widgetHiddenPanel"),
  showWidgetBtn: document.getElementById("showWidgetBtn")
};

init();

async function init() {
  bindEvents();
  render();
  await hydrateState();
  render();

  setInterval(() => {
    checkTimerExpiry();
    renderTimer();
  }, 1000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (changes[STORAGE_KEYS.settings]) {
      state.settings = normalizeSettings(changes[STORAGE_KEYS.settings].newValue);
    }
    if (changes[STORAGE_KEYS.stats]) {
      state.stats = normalizeStats(changes[STORAGE_KEYS.stats].newValue);
    }
    if (changes[STORAGE_KEYS.timer]) {
      state.timer = normalizeTimer(changes[STORAGE_KEYS.timer].newValue);
    }

    render();
  });
}

async function hydrateState() {
  const response = await sendRuntimeMessage({ type: "YFM_GET_STATE" }).catch(() => null);
  if (response) {
    state.settings = normalizeSettings(response.settings);
    state.stats = normalizeStats(response.stats);
    state.timer = normalizeTimer(response.timer);
    return;
  }

  const current = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  state.settings = normalizeSettings(current[STORAGE_KEYS.settings]);
  state.stats = normalizeStats(current[STORAGE_KEYS.stats]);
  state.timer = normalizeTimer(current[STORAGE_KEYS.timer]);
}

function bindEvents() {
  els.openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  els.showWidgetBtn.addEventListener("click", () => {
    updateSettings({ widgetEnabled: true });
  });

  els.studyModeToggle.addEventListener("change", () => {
    updateSettings({ studyMode: els.studyModeToggle.checked });
  });

  for (const id of ["grayscale", "hideShorts", "hideSidebar", "hideHomeFeed", "blockAutoplay", "hideComments", "strictMode", "widgetEnabled"]) {
    els[id].addEventListener("change", () => {
      updateSettings({ [id]: els[id].checked });
    });
  }

  els.startPauseBtn.addEventListener("click", () => {
    if (state.timer.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  els.resetTimerBtn.addEventListener("click", resetTimer);

  els.ambientBtn.addEventListener("click", async () => {
    const ambientEnabled = !state.settings.ambientEnabled;
    await updateSettings({ ambientEnabled });
    sendActiveTabMessage({ type: "YFM_TOGGLE_AMBIENT", ambientEnabled });
  });

  els.whitelistCurrentBtn.addEventListener("click", whitelistCurrentChannel);

  els.whitelistForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const channel = els.channelInput.value.trim();
    if (!channel) {
      return;
    }
    const channels = uniqueChannels([...state.settings.whitelistChannels, channel]);
    els.channelInput.value = "";
    updateSettings({ whitelistChannels: channels });
  });
}

function render() {
  els.studyModeToggle.checked = state.settings.studyMode;
  els.modeLabel.textContent = state.settings.studyMode ? "Study Mode ON" : "Study Mode OFF";
  els.widgetHiddenPanel.hidden = state.settings.widgetEnabled || !state.settings.studyMode;
  els.grayscale.checked = state.settings.grayscale;
  els.hideShorts.checked = state.settings.hideShorts;
  els.hideSidebar.checked = state.settings.hideSidebar;
  els.hideHomeFeed.checked = state.settings.hideHomeFeed;
  els.blockAutoplay.checked = state.settings.blockAutoplay;
  els.hideComments.checked = state.settings.hideComments;
  els.strictMode.checked = state.settings.strictMode;
  els.widgetEnabled.checked = state.settings.widgetEnabled;
  els.ambientBtn.classList.toggle("is-active", state.settings.ambientEnabled);
  els.quoteText.textContent = getPopupQuote();

  els.studyTimeToday.textContent = formatDuration(state.stats.totalStudyMsToday);
  els.avoidedTimeToday.textContent = formatDuration(state.stats.avoidedMsToday);
  els.streakCount.textContent = `${state.stats.streak} ${state.stats.streak === 1 ? "day" : "days"}`;
  els.xpCount.textContent = String(state.stats.xp);

  const level = Math.floor(state.stats.xp / 100) + 1;
  const intoLevel = state.stats.xp % 100;
  els.levelNumber.textContent = String(level);
  els.levelProgressLabel.textContent = `${intoLevel} / 100 XP`;
  els.levelBar.style.width = `${intoLevel}%`;

  renderWhitelist();
  renderSessionReport();
  renderTimer();
}

function renderTimer() {
  const remainingMs = getTimerRemainingMs(state.timer);
  const durationMs = Math.max(1, state.timer.durationMs || getPhaseDuration(state.timer, state.timer.phase));
  const progress = Math.max(0, Math.min(1, remainingMs / durationMs));
  const circumference = 2 * Math.PI * 52;

  els.timerPhase.textContent = getPhaseLabel(state.timer);
  els.timerDisplay.textContent = formatClock(remainingMs);
  els.startPauseBtn.textContent = state.timer.isRunning ? "Pause" : "Start";
  els.timerProgressCircle.style.strokeDasharray = String(circumference);
  els.timerProgressCircle.style.strokeDashoffset = String(circumference * (1 - progress));
  els.timerProgressLabel.textContent = `${Math.round(progress * 100)}%`;
}

function renderSessionReport() {
  const report = state.stats.lastSessionReport;
  if (!report || !report.completedAt) {
    els.sessionReport.hidden = true;
    return;
  }

  els.sessionReport.hidden = false;
  els.sessionReportTime.textContent = formatTimeAgo(report.completedAt);
  els.reportDuration.textContent = formatDuration(report.durationMs);
  els.reportXp.textContent = `+${report.xpEarned}`;
  els.reportGoal.textContent = `${report.goalPercent}%`;
}

function renderWhitelist() {
  els.whitelistList.innerHTML = "";

  if (!state.settings.whitelistChannels.length) {
    const empty = document.createElement("li");
    empty.textContent = "No channels yet";
    els.whitelistList.append(empty);
    return;
  }

  for (const channel of state.settings.whitelistChannels) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const remove = document.createElement("button");

    name.textContent = channel;
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${channel}`);
    remove.addEventListener("click", () => {
      updateSettings({
        whitelistChannels: state.settings.whitelistChannels.filter((saved) => saved !== channel)
      });
    });

    item.append(name, remove);
    els.whitelistList.append(item);
  }
}

async function updateSettings(partial) {
  state.settings = normalizeSettings({ ...state.settings, ...partial });
  setSyncStatus("Saving");
  render();
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
  setSyncStatus("Saved");
}

async function whitelistCurrentChannel() {
  els.whitelistCurrentBtn.textContent = "Checking YouTube...";
  const response = await sendActiveTabMessage({ type: "YFM_GET_CURRENT_CHANNEL" });
  const channel = response?.channelName?.trim();

  if (!channel) {
    els.whitelistCurrentBtn.textContent = "Open a YouTube video first";
    setTimeout(() => {
      els.whitelistCurrentBtn.textContent = "Whitelist Current Channel";
    }, 1800);
    return;
  }

  const channels = uniqueChannels([...state.settings.whitelistChannels, channel]);
  await updateSettings({ whitelistChannels: channels });
  els.whitelistCurrentBtn.textContent = "Channel Whitelisted";
  setTimeout(() => {
    els.whitelistCurrentBtn.textContent = "Whitelist Current Channel";
  }, 1400);
}

  async function startTimer() {
    state.timer = buildStartedTimer(state.timer);
    await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
    renderTimer();
  }

  async function pauseTimer() {
    state.timer = buildPausedTimer(state.timer);
    await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
    renderTimer();
  }

  async function resetTimer() {
    state.timer = buildResetTimer(state.timer);
    await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
    renderTimer();
  }

// The background worker owns phase transitions. The popup only reports that
// the running phase has hit zero; the background dedupes by session id.
function checkTimerExpiry() {
  if (!state.timer.isRunning || getTimerRemainingMs(state.timer) > 0) {
    return;
  }
  sendRuntimeMessage({ type: "YFM_TIMER_EXPIRED", sessionId: state.timer.sessionId }).catch(() => null);
}

function formatTimeAgo(timestamp) {
  const ageMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function setSyncStatus(label) {
  els.syncStatus.textContent = label;
}

async function sendActiveTabMessage(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !/^https:\/\/(www|m)\.youtube\.com\//.test(tab.url || "")) {
    return null;
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}
