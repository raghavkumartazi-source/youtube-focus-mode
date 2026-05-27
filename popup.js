const STORAGE_KEYS = {
  settings: "yfmSettings",
  stats: "yfmStats",
  timer: "yfmTimer"
};

const DEFAULT_SETTINGS = {
  studyMode: true,
  hideShorts: true,
  hideSidebar: true,
  hideHomeFeed: true,
  hideComments: false,
  blockAutoplay: true,
  strictMode: false,
  blockScreen: true,
  notificationsEnabled: true,
  soundAlerts: true,
  ambientEnabled: false,
  ambientSound: "rain",
  ambientVolume: 45,
  dailyGoalMinutes: 120,
  whitelistChannels: []
};

const DEFAULT_STATS = {
  date: getTodayKey(),
  totalStudyMsToday: 0,
  avoidedMsToday: 0,
  focusSessionsToday: 0,
  streak: 0,
  xp: 0,
  lastFocusDate: "",
  lastCompletedSessionId: "",
  lastCompletedBreakSessionId: "",
  history: {}
};

const DEFAULT_TIMER = {
  phase: "focus",
  focusMs: 25 * 60 * 1000,
  breakMs: 5 * 60 * 1000,
  durationMs: 25 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  isRunning: false,
  startedAt: 0,
  endsAt: 0,
  sessionId: ""
};

const QUOTES = [
  "Small progress, repeated daily, becomes serious momentum.",
  "The next focused block is enough. Begin there.",
  "Attention is a skill. Every session trains it.",
  "Study the thing in front of you. Let the rest wait.",
  "One clean hour can change the whole day.",
  "Build the habit quietly. The results will get loud."
];

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
  syncStatus: document.getElementById("syncStatus"),
  hideShorts: document.getElementById("hideShorts"),
  hideSidebar: document.getElementById("hideSidebar"),
  hideHomeFeed: document.getElementById("hideHomeFeed"),
  blockAutoplay: document.getElementById("blockAutoplay"),
  hideComments: document.getElementById("hideComments"),
  strictMode: document.getElementById("strictMode"),
  whitelistCurrentBtn: document.getElementById("whitelistCurrentBtn"),
  whitelistForm: document.getElementById("whitelistForm"),
  channelInput: document.getElementById("channelInput"),
  whitelistList: document.getElementById("whitelistList")
};

init();

async function init() {
  bindEvents();
  render();
  await hydrateState();
  render();

  setInterval(() => {
    handleTimerCompletion();
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

  els.studyModeToggle.addEventListener("change", () => {
    updateSettings({ studyMode: els.studyModeToggle.checked });
  });

  for (const id of ["hideShorts", "hideSidebar", "hideHomeFeed", "blockAutoplay", "hideComments", "strictMode"]) {
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
  els.hideShorts.checked = state.settings.hideShorts;
  els.hideSidebar.checked = state.settings.hideSidebar;
  els.hideHomeFeed.checked = state.settings.hideHomeFeed;
  els.blockAutoplay.checked = state.settings.blockAutoplay;
  els.hideComments.checked = state.settings.hideComments;
  els.strictMode.checked = state.settings.strictMode;
  els.ambientBtn.classList.toggle("is-active", state.settings.ambientEnabled);
  els.quoteText.textContent = QUOTES[getDayQuoteIndex()];

  els.studyTimeToday.textContent = formatDuration(state.stats.totalStudyMsToday);
  els.avoidedTimeToday.textContent = formatDuration(state.stats.avoidedMsToday);
  els.streakCount.textContent = `${state.stats.streak} ${state.stats.streak === 1 ? "day" : "days"}`;
  els.xpCount.textContent = String(state.stats.xp);

  renderWhitelist();
  renderTimer();
}

function renderTimer() {
  const remainingMs = getTimerRemainingMs(state.timer);
  const durationMs = Math.max(1, state.timer.durationMs || getPhaseDuration(state.timer.phase));
  const progress = Math.max(0, Math.min(1, remainingMs / durationMs));
  const circumference = 2 * Math.PI * 52;

  els.timerPhase.textContent = state.timer.phase === "break" ? "Break" : "Focus";
  els.timerDisplay.textContent = formatClock(remainingMs);
  els.startPauseBtn.textContent = state.timer.isRunning ? "Pause" : "Start";
  els.timerProgressCircle.style.strokeDasharray = String(circumference);
  els.timerProgressCircle.style.strokeDashoffset = String(circumference * (1 - progress));
  els.timerProgressLabel.textContent = `${Math.round(progress * 100)}%`;
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
  const remainingMs = getTimerRemainingMs(state.timer) || getPhaseDuration(state.timer.phase);
  const now = Date.now();
  const sessionId = state.timer.sessionId || createSessionId();

  state.timer = normalizeTimer({
    ...state.timer,
    durationMs: getPhaseDuration(state.timer.phase),
    remainingMs,
    isRunning: true,
    startedAt: now,
    endsAt: now + remainingMs,
    sessionId
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
  renderTimer();
}

async function pauseTimer() {
  state.timer = normalizeTimer({
    ...state.timer,
    remainingMs: getTimerRemainingMs(state.timer),
    isRunning: false,
    startedAt: 0,
    endsAt: 0
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
  renderTimer();
}

async function resetTimer() {
  const durationMs = getPhaseDuration(state.timer.phase);
  state.timer = normalizeTimer({
    ...state.timer,
    durationMs,
    remainingMs: durationMs,
    isRunning: false,
    startedAt: 0,
    endsAt: 0,
    sessionId: createSessionId()
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
  renderTimer();
}

async function handleTimerCompletion() {
  if (!state.timer.isRunning || getTimerRemainingMs(state.timer) > 0) {
    return;
  }

  const completed = { ...state.timer };
  const nextPhase = completed.phase === "focus" ? "break" : "focus";
  const nextDuration = nextPhase === "focus" ? completed.focusMs : completed.breakMs;

  if (completed.phase === "focus") {
    await sendRuntimeMessage({
      type: "YFM_FOCUS_SESSION_COMPLETE",
      sessionId: completed.sessionId,
      durationMs: completed.durationMs || completed.focusMs
    }).catch(() => null);
  } else {
    await sendRuntimeMessage({
      type: "YFM_BREAK_COMPLETE",
      sessionId: completed.sessionId
    }).catch(() => null);
  }

  state.timer = normalizeTimer({
    ...completed,
    phase: nextPhase,
    durationMs: nextDuration,
    remainingMs: nextDuration,
    isRunning: nextPhase === "break",
    startedAt: nextPhase === "break" ? Date.now() : 0,
    endsAt: nextPhase === "break" ? Date.now() + nextDuration : 0,
    sessionId: createSessionId()
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
  render();
}

function getPhaseDuration(phase) {
  return phase === "break" ? state.timer.breakMs : state.timer.focusMs;
}

function getTimerRemainingMs(timer) {
  if (!timer.isRunning || !timer.endsAt) {
    return Math.max(0, timer.remainingMs);
  }
  return Math.max(0, timer.endsAt - Date.now());
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    ambientVolume: clampNumber(settings.ambientVolume, 0, 100, DEFAULT_SETTINGS.ambientVolume),
    dailyGoalMinutes: clampNumber(settings.dailyGoalMinutes, 15, 600, DEFAULT_SETTINGS.dailyGoalMinutes),
    whitelistChannels: uniqueChannels(settings.whitelistChannels || [])
  };
}

function normalizeStats(stats = {}) {
  return {
    ...DEFAULT_STATS,
    ...stats,
    totalStudyMsToday: Number(stats.totalStudyMsToday) || 0,
    avoidedMsToday: Number(stats.avoidedMsToday) || 0,
    focusSessionsToday: Number(stats.focusSessionsToday) || 0,
    streak: Number(stats.streak) || 0,
    xp: Number(stats.xp) || 0,
    history: stats.history || {}
  };
}

function normalizeTimer(timer = {}) {
  return {
    ...DEFAULT_TIMER,
    ...timer,
    focusMs: numberOrDefault(timer.focusMs, DEFAULT_TIMER.focusMs),
    breakMs: numberOrDefault(timer.breakMs, DEFAULT_TIMER.breakMs),
    durationMs: numberOrDefault(timer.durationMs, DEFAULT_TIMER.durationMs),
    remainingMs: numberOrDefault(timer.remainingMs, DEFAULT_TIMER.remainingMs)
  };
}

function uniqueChannels(channels) {
  const seen = new Set();
  const result = [];
  for (const channel of channels) {
    const clean = String(channel || "").trim().replace(/\s+/g, " ");
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
}

function formatClock(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getTodayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getDayQuoteIndex() {
  const seed = getTodayKey().split("-").join("");
  return Number(seed) % QUOTES.length;
}

function createSessionId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberOrDefault(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function setSyncStatus(label) {
  els.syncStatus.textContent = label;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
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
