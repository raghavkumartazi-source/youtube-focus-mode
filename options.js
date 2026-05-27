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

const state = {
  settings: { ...DEFAULT_SETTINGS },
  stats: { ...DEFAULT_STATS },
  timer: { ...DEFAULT_TIMER }
};

const els = {
  studyMode: document.getElementById("studyMode"),
  totalToday: document.getElementById("totalToday"),
  avoidedToday: document.getElementById("avoidedToday"),
  streak: document.getElementById("streak"),
  xpLevel: document.getElementById("xpLevel"),
  goalTitle: document.getElementById("goalTitle"),
  goalPercent: document.getElementById("goalPercent"),
  goalBar: document.getElementById("goalBar"),
  historyChart: document.getElementById("historyChart"),
  focusMinutes: document.getElementById("focusMinutes"),
  breakMinutes: document.getElementById("breakMinutes"),
  dailyGoalMinutes: document.getElementById("dailyGoalMinutes"),
  ambientSound: document.getElementById("ambientSound"),
  ambientVolume: document.getElementById("ambientVolume"),
  hideShorts: document.getElementById("hideShorts"),
  hideSidebar: document.getElementById("hideSidebar"),
  hideHomeFeed: document.getElementById("hideHomeFeed"),
  hideComments: document.getElementById("hideComments"),
  blockAutoplay: document.getElementById("blockAutoplay"),
  strictMode: document.getElementById("strictMode"),
  blockScreen: document.getElementById("blockScreen"),
  notificationsEnabled: document.getElementById("notificationsEnabled"),
  soundAlerts: document.getElementById("soundAlerts"),
  saveStatus: document.getElementById("saveStatus"),
  whitelistForm: document.getElementById("whitelistForm"),
  channelInput: document.getElementById("channelInput"),
  whitelistList: document.getElementById("whitelistList")
};

init();

async function init() {
  bindEvents();
  await hydrateState();
  render();

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
  const settingInputs = [
    "studyMode",
    "hideShorts",
    "hideSidebar",
    "hideHomeFeed",
    "hideComments",
    "blockAutoplay",
    "strictMode",
    "blockScreen",
    "notificationsEnabled",
    "soundAlerts"
  ];

  for (const id of settingInputs) {
    els[id].addEventListener("change", () => {
      updateSettings({ [id]: els[id].checked });
    });
  }

  for (const id of ["dailyGoalMinutes", "ambientVolume", "ambientSound"]) {
    els[id].addEventListener("input", () => {
      updateSettings({
        dailyGoalMinutes: Number(els.dailyGoalMinutes.value),
        ambientVolume: Number(els.ambientVolume.value),
        ambientSound: els.ambientSound.value
      });
    });
  }

  for (const id of ["focusMinutes", "breakMinutes"]) {
    els[id].addEventListener("change", updateTimerLengths);
  }

  els.whitelistForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const channel = els.channelInput.value.trim();
    if (!channel) {
      return;
    }
    els.channelInput.value = "";
    updateSettings({
      whitelistChannels: uniqueChannels([...state.settings.whitelistChannels, channel])
    });
  });
}

function render() {
  els.studyMode.checked = state.settings.studyMode;
  els.totalToday.textContent = formatDuration(state.stats.totalStudyMsToday);
  els.avoidedToday.textContent = formatDuration(state.stats.avoidedMsToday);
  els.streak.textContent = `${state.stats.streak} ${state.stats.streak === 1 ? "day" : "days"}`;
  els.xpLevel.textContent = `Level ${Math.floor(state.stats.xp / 100) + 1}`;

  const todayMinutes = Math.floor(state.stats.totalStudyMsToday / 60000);
  const goalMinutes = state.settings.dailyGoalMinutes;
  const goalPercent = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100));
  els.goalTitle.textContent = `${todayMinutes} / ${goalMinutes} min`;
  els.goalPercent.textContent = `${goalPercent}%`;
  els.goalBar.style.width = `${goalPercent}%`;

  els.focusMinutes.value = Math.round(state.timer.focusMs / 60000);
  els.breakMinutes.value = Math.round(state.timer.breakMs / 60000);
  els.dailyGoalMinutes.value = state.settings.dailyGoalMinutes;
  els.ambientSound.value = state.settings.ambientSound;
  els.ambientVolume.value = state.settings.ambientVolume;

  for (const id of [
    "hideShorts",
    "hideSidebar",
    "hideHomeFeed",
    "hideComments",
    "blockAutoplay",
    "strictMode",
    "blockScreen",
    "notificationsEnabled",
    "soundAlerts"
  ]) {
    els[id].checked = state.settings[id];
  }

  renderHistoryChart();
  renderWhitelist();
}

function renderHistoryChart() {
  const days = getLastSevenDays();
  const values = days.map((date) => state.stats.history[date]?.studyMs || 0);
  const maxValue = Math.max(...values, 30 * 60 * 1000);

  els.historyChart.innerHTML = "";
  for (const date of days) {
    const studyMs = state.stats.history[date]?.studyMs || 0;
    const height = Math.max(8, Math.round((studyMs / maxValue) * 132));
    const item = document.createElement("div");
    const bar = document.createElement("div");
    const value = document.createElement("span");
    const label = document.createElement("small");

    item.className = "history-day";
    bar.className = "history-bar";
    bar.style.height = `${height}px`;
    value.textContent = formatDuration(studyMs);
    label.textContent = formatDayLabel(date);

    bar.append(value);
    item.append(bar, label);
    els.historyChart.append(item);
  }
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
  setSaveStatus("Saving");
  render();
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
  setSaveStatus("Saved");
}

async function updateTimerLengths() {
  const focusMs = clampNumber(Number(els.focusMinutes.value), 5, 180, 25) * 60 * 1000;
  const breakMs = clampNumber(Number(els.breakMinutes.value), 1, 60, 5) * 60 * 1000;
  const currentDuration = state.timer.phase === "break" ? breakMs : focusMs;
  const remainingMs = state.timer.isRunning
    ? Math.min(getTimerRemainingMs(state.timer), currentDuration)
    : currentDuration;
  const now = Date.now();

  state.timer = normalizeTimer({
    ...state.timer,
    focusMs,
    breakMs,
    durationMs: currentDuration,
    remainingMs,
    startedAt: state.timer.isRunning ? now : 0,
    endsAt: state.timer.isRunning ? now + remainingMs : 0
  });

  setSaveStatus("Saving");
  await chrome.storage.local.set({ [STORAGE_KEYS.timer]: state.timer });
  setSaveStatus("Saved");
  render();
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
    ambientSound: ["rain", "cafe", "white-noise", "forest"].includes(settings.ambientSound)
      ? settings.ambientSound
      : DEFAULT_SETTINGS.ambientSound,
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
    const key = clean.replace(/^@/, "").toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
}

function getLastSevenDays() {
  const days = [];
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  for (let index = 6; index >= 0; index -= 1) {
    const next = new Date(date);
    next.setDate(date.getDate() - index);
    days.push(getTodayKey(next));
  }
  return days;
}

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short" });
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

function setSaveStatus(label) {
  els.saveStatus.textContent = label;
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
