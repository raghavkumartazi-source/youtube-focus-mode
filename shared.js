// Shared constants, normalizers, and utilities for YouTube Focus Mode.
// Loaded by the background worker (importScripts), the popup and options
// pages (script tags), and the content script (manifest content_scripts).

const STORAGE_KEYS = {
  settings: "yfmSettings",
  stats: "yfmStats",
  timer: "yfmTimer",
  widgetPosition: "yfmWidgetPosition"
};

const DEFAULT_SETTINGS = {
  studyMode: true,
  widgetEnabled: true,
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
  longBreakMinutes: 15,
  sessionsUntilLongBreak: 4,
  autoStartNextFocus: false,
  whitelistChannels: []
};

const DEFAULT_STATS = {
  date: getTodayKey(),
  totalStudyMsToday: 0,
  avoidedMsToday: 0,
  focusSessionsToday: 0,
  streak: 0,
  bestStreak: 0,
  xp: 0,
  totalStudyMsAllTime: 0,
  lastFocusDate: "",
  lastCompletedSessionId: "",
  lastCompletedBreakSessionId: "",
  lastSessionReport: null,
  history: {}
};

const DEFAULT_TIMER = {
  phase: "focus",
  focusMs: 25 * 60 * 1000,
  breakMs: 5 * 60 * 1000,
  durationMs: 25 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  isRunning: false,
  isLongBreak: false,
  cycleCount: 0,
  startedAt: 0,
  endsAt: 0,
  sessionId: ""
};

const AMBIENT_SOUNDS = ["rain", "cafe", "white-noise", "forest"];

const HISTORY_KEEP_DAYS = 60;

// Rotated on the in-page widget; kept short so they fit the compact face.
const WIDGET_QUOTES = [
  "Stay with the lesson.",
  "The sidebar can wait.",
  "One focused block at a time.",
  "Make this video count.",
  "Protect the next 25 minutes.",
  "Learn first. Browse later."
];

// Shown in the popup once per day, so they can run a little longer.
const POPUP_QUOTES = [
  "Small progress, repeated daily, becomes serious momentum.",
  "The next focused block is enough. Begin there.",
  "Attention is a skill. Every session trains it.",
  "Study the thing in front of you. Let the rest wait.",
  "One clean hour can change the whole day.",
  "Build the habit quietly. The results will get loud."
];

// XP rewards length of focus, not just session count. The default 25 minute
// block still earns the flat 25 XP the earlier version awarded.
const XP_PER_MINUTE = 1;
const MIN_SESSION_XP = 5;

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    strictMode: Boolean(settings.strictMode),
    widgetEnabled: settings.widgetEnabled !== false,
    blockScreen: settings.blockScreen !== false,
    notificationsEnabled: settings.notificationsEnabled !== false,
    soundAlerts: settings.soundAlerts !== false,
    ambientVolume: clampNumber(settings.ambientVolume, 0, 100, DEFAULT_SETTINGS.ambientVolume),
    dailyGoalMinutes: clampNumber(settings.dailyGoalMinutes, 15, 600, DEFAULT_SETTINGS.dailyGoalMinutes),
    longBreakMinutes: clampNumber(settings.longBreakMinutes, 5, 60, DEFAULT_SETTINGS.longBreakMinutes),
    sessionsUntilLongBreak: clampNumber(settings.sessionsUntilLongBreak, 2, 8, DEFAULT_SETTINGS.sessionsUntilLongBreak),
    autoStartNextFocus: Boolean(settings.autoStartNextFocus),
    ambientSound: AMBIENT_SOUNDS.includes(settings.ambientSound)
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
    bestStreak: Number(stats.bestStreak) || 0,
    xp: Number(stats.xp) || 0,
    totalStudyMsAllTime: Number(stats.totalStudyMsAllTime) || 0,
    lastSessionReport: normalizeSessionReport(stats.lastSessionReport),
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
    remainingMs: numberOrDefault(timer.remainingMs, DEFAULT_TIMER.remainingMs),
    isLongBreak: Boolean(timer.isLongBreak),
    cycleCount: Math.max(0, Math.floor(numberOrDefault(timer.cycleCount, 0)))
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
  const cutoffKey = getHistoryCutoffKey();
  for (const [date, value] of Object.entries(history || {})) {
    if (!date || date < cutoffKey) {
      continue;
    }
    result[date] = {
      studyMs: Number(value.studyMs) || 0,
      avoidedMs: Number(value.avoidedMs) || 0,
      sessions: Number(value.sessions) || 0,
      xp: Number(value.xp) || 0
    };
  }
  return result;
}

function normalizeSessionReport(report) {
  if (!report || typeof report !== "object") {
    return null;
  }

  return {
    sessionId: String(report.sessionId || ""),
    completedAt: Number(report.completedAt) || 0,
    durationMs: Number(report.durationMs) || 0,
    xpEarned: Number(report.xpEarned) || 0,
    streak: Number(report.streak) || 0,
    totalStudyMsToday: Number(report.totalStudyMsToday) || 0,
    dailyGoalMinutes: Number(report.dailyGoalMinutes) || DEFAULT_SETTINGS.dailyGoalMinutes,
    goalPercent: clampNumber(report.goalPercent, 0, 100, 0)
  };
}

function normalizeChannelName(channel) {
  return String(channel || "")
    .trim()
    .replace(/^@/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function uniqueChannels(channels) {
  const seen = new Set();
  const result = [];
  for (const channel of channels) {
    const clean = String(channel || "").trim().replace(/\s+/g, " ");
    const key = normalizeChannelName(clean);
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
}

function getPhaseDuration(timer, phase) {
  return phase === "break" ? timer.breakMs : timer.focusMs;
}

function getPhaseLabel(timer) {
  if (timer.phase === "break") {
    return timer.isLongBreak ? "Long Break" : "Break";
  }
  return "Focus";
}

function getTimerRemainingMs(timer) {
  if (!timer.isRunning || !timer.endsAt) {
    return Math.max(0, timer.remainingMs);
  }
  return Math.max(0, timer.endsAt - Date.now());
}

// The three timer entry points (background, popup, content script) all run the
// same start/pause/reset transitions. Centralizing them here keeps the timer
// state machine in one place so the copies cannot drift apart.

function buildStartedTimer(timer) {
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

function buildPausedTimer(timer) {
  return normalizeTimer({
    ...timer,
    remainingMs: getTimerRemainingMs(timer),
    isRunning: false,
    startedAt: 0,
    endsAt: 0
  });
}

function buildResetTimer(timer) {
  const durationMs = getPhaseDuration(timer, timer.phase);
  return normalizeTimer({
    ...timer,
    durationMs,
    remainingMs: durationMs,
    isRunning: false,
    startedAt: 0,
    endsAt: 0,
    sessionId: createSessionId()
  });
}

// XP tracks actual focused time so a five minute block can no longer earn the
// same reward as a full Pomodoro.
function computeFocusXp(durationMs) {
  const minutes = Math.round((Number(durationMs) || 0) / 60000);
  if (minutes <= 0) {
    return 0;
  }
  return Math.max(MIN_SESSION_XP, minutes * XP_PER_MINUTE);
}

// A streak continues when the previous session was yesterday or earlier today;
// any gap longer than a day resets it back to one.
function computeNextStreak(stats, today = getTodayKey()) {
  if (stats.lastFocusDate === today) {
    return stats.streak;
  }
  if (getPreviousDayKey(today) === stats.lastFocusDate) {
    return stats.streak + 1;
  }
  return 1;
}

function getPreviousDayKey(todayKey = getTodayKey()) {
  const [year, month, day] = todayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return getTodayKey(date);
}

// The widget quote rotates every minute; the popup quote is stable for the day.
function getWidgetQuote() {
  const index = Math.floor(Date.now() / 60000) % WIDGET_QUOTES.length;
  return WIDGET_QUOTES[index];
}

function getPopupQuote() {
  const seed = Number(getTodayKey().split("-").join(""));
  return POPUP_QUOTES[seed % POPUP_QUOTES.length];
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
  return Math.max(min, Math.min(numeric, max));
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

function getHistoryCutoffKey(keepDays = HISTORY_KEEP_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  return getTodayKey(cutoff);
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
