const STORAGE_KEYS = {
  settings: "yfmSettings",
  stats: "yfmStats",
  timer: "yfmTimer",
  widgetPosition: "yfmWidgetPosition"
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

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStorageDefaults();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureStorageDefaults();
  await resetDailyStatsIfNeeded();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "YFM_GET_STATE") {
    getState().then(sendResponse);
    return true;
  }

  if (message.type === "YFM_TRACK_ACTIVITY") {
    trackActivity(message).then(sendResponse);
    return true;
  }

  if (message.type === "YFM_FOCUS_SESSION_COMPLETE") {
    completeFocusSession(message).then(sendResponse);
    return true;
  }

  if (message.type === "YFM_BREAK_COMPLETE") {
    notifyBreakComplete(message).then(sendResponse);
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-study-mode") {
    toggleStudyMode();
  }

  if (command === "start-pause-timer") {
    startPauseTimer();
  }

  if (command === "toggle-ambient") {
    toggleAmbient();
  }
});

async function ensureStorageDefaults() {
  const current = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const next = {};

  next[STORAGE_KEYS.settings] = normalizeSettings(current[STORAGE_KEYS.settings]);
  next[STORAGE_KEYS.stats] = normalizeStats(current[STORAGE_KEYS.stats]);
  next[STORAGE_KEYS.timer] = normalizeTimer(current[STORAGE_KEYS.timer]);
  next[STORAGE_KEYS.widgetPosition] = normalizePosition(current[STORAGE_KEYS.widgetPosition]);

  await chrome.storage.local.set(next);
}

async function getState() {
  await ensureStorageDefaults();
  await resetDailyStatsIfNeeded();
  const current = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    settings: normalizeSettings(current[STORAGE_KEYS.settings]),
    stats: normalizeStats(current[STORAGE_KEYS.stats]),
    timer: normalizeTimer(current[STORAGE_KEYS.timer]),
    widgetPosition: normalizePosition(current[STORAGE_KEYS.widgetPosition])
  };
}

async function trackActivity(message) {
  await ensureStorageDefaults();
  const stats = await getFreshStats();
  const studyMs = clampMs(message.studyMs, 60 * 60 * 1000);
  const avoidedMs = clampMs(message.avoidedMs, 60 * 60 * 1000);

  const nextStats = recordHistory({
    ...stats,
    totalStudyMsToday: stats.totalStudyMsToday + studyMs,
    avoidedMsToday: stats.avoidedMsToday + avoidedMs
  }, { studyMs, avoidedMs, sessions: 0, xp: 0 });

  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: nextStats });
  return { ok: true, stats: nextStats };
}

async function completeFocusSession(message) {
  await ensureStorageDefaults();
  const sessionId = String(message.sessionId || "");
  const durationMs = clampMs(message.durationMs, 3 * 60 * 60 * 1000);
  const stats = await getFreshStats();

  if (!sessionId || stats.lastCompletedSessionId === sessionId) {
    return { ok: true, stats, duplicate: true };
  }

  const today = getTodayKey();
  const wasAlreadyFocusedToday = stats.lastFocusDate === today;
  const nextStreak = wasAlreadyFocusedToday
    ? stats.streak
    : getYesterdayKey() === stats.lastFocusDate
      ? stats.streak + 1
      : 1;

  const nextStats = recordHistory({
    ...stats,
    totalStudyMsToday: stats.totalStudyMsToday + durationMs,
    focusSessionsToday: stats.focusSessionsToday + 1,
    streak: nextStreak,
    xp: stats.xp + 25,
    lastFocusDate: today,
    lastCompletedSessionId: sessionId
  }, { studyMs: durationMs, avoidedMs: 0, sessions: 1, xp: 25 });

  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: nextStats });
  await notifyFocusComplete();
  return { ok: true, stats: nextStats };
}

async function notifyFocusComplete() {
  const settings = await getFreshSettings();
  if (!settings.notificationsEnabled) {
    return;
  }

  await createNotification("focus-complete", {
    title: "Focus session complete",
    message: "Nice work. Take a 5 minute break, then come back fresh."
  });
}

async function notifyBreakComplete(message = {}) {
  const sessionId = String(message.sessionId || "");
  const stats = await getFreshStats();
  if (sessionId && stats.lastCompletedBreakSessionId === sessionId) {
    return { ok: true, notified: false, duplicate: true };
  }

  const settings = await getFreshSettings();
  if (!settings.notificationsEnabled) {
    return { ok: true, notified: false };
  }

  await createNotification("break-complete", {
    title: "Break complete",
    message: "Ready for the next focused session?"
  });
  if (sessionId) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.stats]: {
        ...stats,
        lastCompletedBreakSessionId: sessionId
      }
    });
  }
  return { ok: true, notified: true };
}

async function createNotification(id, options) {
  if (!chrome.notifications?.create) {
    return;
  }

  try {
    await chrome.notifications.create(`yfm-${id}-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: options.title,
      message: options.message,
      priority: 1
    });
  } catch (_error) {
    // Notifications are helpful, but should never break timer completion.
  }
}

async function resetDailyStatsIfNeeded() {
  const stats = await getFreshStats(false);
  if (stats.date === getTodayKey()) {
    return stats;
  }

  const nextStats = {
    ...stats,
    date: getTodayKey(),
    totalStudyMsToday: 0,
    avoidedMsToday: 0,
    focusSessionsToday: 0,
    lastCompletedSessionId: "",
    lastCompletedBreakSessionId: ""
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: nextStats });
  return nextStats;
}

async function getFreshSettings() {
  const current = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(current[STORAGE_KEYS.settings]);
}

async function getFreshStats(resetIfNeeded = true) {
  const current = await chrome.storage.local.get(STORAGE_KEYS.stats);
  const stats = normalizeStats(current[STORAGE_KEYS.stats]);
  if (resetIfNeeded && stats.date !== getTodayKey()) {
    const resetStats = {
      ...stats,
      date: getTodayKey(),
      totalStudyMsToday: 0,
      avoidedMsToday: 0,
      focusSessionsToday: 0,
      lastCompletedSessionId: "",
      lastCompletedBreakSessionId: ""
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.stats]: resetStats });
    return resetStats;
  }
  return stats;
}

async function getFreshTimer() {
  const current = await chrome.storage.local.get(STORAGE_KEYS.timer);
  return normalizeTimer(current[STORAGE_KEYS.timer]);
}

async function toggleStudyMode() {
  const settings = await getFreshSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: normalizeSettings({
      ...settings,
      studyMode: !settings.studyMode
    })
  });
}

async function toggleAmbient() {
  const settings = await getFreshSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: normalizeSettings({
      ...settings,
      ambientEnabled: !settings.ambientEnabled
    })
  });
}

async function startPauseTimer() {
  const timer = await getFreshTimer();
  const nextTimer = timer.isRunning ? pauseTimer(timer) : startTimer(timer);
  await chrome.storage.local.set({ [STORAGE_KEYS.timer]: nextTimer });
}

function startTimer(timer) {
  const remainingMs = getTimerRemainingMs(timer) || getPhaseDuration(timer, timer.phase);
  const now = Date.now();
  return normalizeTimer({
    ...timer,
    durationMs: getPhaseDuration(timer, timer.phase),
    remainingMs,
    isRunning: true,
    startedAt: now,
    endsAt: now + remainingMs,
    sessionId: timer.sessionId || createSessionId()
  });
}

function pauseTimer(timer) {
  return normalizeTimer({
    ...timer,
    remainingMs: getTimerRemainingMs(timer),
    isRunning: false,
    startedAt: 0,
    endsAt: 0
  });
}

function getPhaseDuration(timer, phase) {
  return phase === "break" ? timer.breakMs : timer.focusMs;
}

function getTimerRemainingMs(timer) {
  if (!timer.isRunning || !timer.endsAt) {
    return Math.max(0, timer.remainingMs);
  }
  return Math.max(0, timer.endsAt - Date.now());
}

function recordHistory(stats, increment) {
  const today = getTodayKey();
  const currentDay = stats.history[today] || {
    studyMs: 0,
    avoidedMs: 0,
    sessions: 0,
    xp: 0
  };

  return {
    ...stats,
    history: {
      ...stats.history,
      [today]: {
        studyMs: currentDay.studyMs + increment.studyMs,
        avoidedMs: currentDay.avoidedMs + increment.avoidedMs,
        sessions: currentDay.sessions + increment.sessions,
        xp: currentDay.xp + increment.xp
      }
    }
  };
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    strictMode: Boolean(settings.strictMode),
    blockScreen: settings.blockScreen !== false,
    notificationsEnabled: settings.notificationsEnabled !== false,
    soundAlerts: settings.soundAlerts !== false,
    ambientVolume: clampNumber(settings.ambientVolume, 0, 100, DEFAULT_SETTINGS.ambientVolume),
    dailyGoalMinutes: clampNumber(settings.dailyGoalMinutes, 15, 600, DEFAULT_SETTINGS.dailyGoalMinutes),
    ambientSound: ["rain", "cafe", "white-noise", "forest"].includes(settings.ambientSound)
      ? settings.ambientSound
      : DEFAULT_SETTINGS.ambientSound,
    whitelistChannels: Array.isArray(settings.whitelistChannels)
      ? uniqueChannels(settings.whitelistChannels)
      : []
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
    history: normalizeHistory(stats.history)
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

function normalizePosition(position = {}) {
  return {
    x: Number(position.x) || 24,
    y: Number(position.y) || 96
  };
}

function normalizeHistory(history = {}) {
  const result = {};
  for (const [date, value] of Object.entries(history || {})) {
    result[date] = {
      studyMs: Number(value.studyMs) || 0,
      avoidedMs: Number(value.avoidedMs) || 0,
      sessions: Number(value.sessions) || 0,
      xp: Number(value.xp) || 0
    };
  }
  return result;
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

function clampMs(value, max) {
  const numeric = Number(value) || 0;
  return Math.max(0, Math.min(numeric, max));
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function numberOrDefault(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createSessionId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTodayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getYesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getTodayKey(date);
}
