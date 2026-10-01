importScripts("shared.js");

const TIMER_ALARM_NAME = "yfm-timer-complete";
const BADGE_ALARM_NAME = "yfm-badge-tick";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStorageDefaults();
  await syncTimerAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureStorageDefaults();
  await resetDailyStatsIfNeeded();
  await advanceTimerIfExpired();
  await syncTimerAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIMER_ALARM_NAME) {
    advanceTimerIfExpired();
  }
  if (alarm.name === BADGE_ALARM_NAME) {
    getFreshTimer().then(updateBadge);
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!String(notificationId).startsWith("yfm-")) {
    return;
  }

  chrome.notifications.clear(notificationId);
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://www.youtube.com/*", "https://m.youtube.com/*"]
    });
    if (tabs.length) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: "https://www.youtube.com/" });
    }
  } catch (_error) {
    // Focus handoff is a nicety; never let it throw.
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEYS.timer]) {
    scheduleTimerAlarm(normalizeTimer(changes[STORAGE_KEYS.timer].newValue));
  }
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

  if (message.type === "YFM_TIMER_EXPIRED") {
    advanceTimerIfExpired(message).then(sendResponse);
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

  // Only write when a value actually changed. This runs on every state read,
  // and a blind write would churn storage.onChanged listeners (and the
  // popup/content re-renders they trigger) once per activity tick.
  const changed = Object.keys(next).some(
    (key) => !isDeepEqual(current[key], next[key])
  );
  if (changed) {
    await chrome.storage.local.set(next);
  }
}

function isDeepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b || a === null || b === null) {
    return false;
  }
  if (typeof a !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => isDeepEqual(a[key], b[key]));
}

async function getState() {
  await ensureStorageDefaults();
  await resetDailyStatsIfNeeded();
  await advanceTimerIfExpired();
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
    totalStudyMsAllTime: stats.totalStudyMsAllTime + studyMs,
    avoidedMsToday: stats.avoidedMsToday + avoidedMs
  }, { studyMs, avoidedMs, sessions: 0, xp: 0 });

  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: nextStats });
  return { ok: true, stats: nextStats };
}

async function completeFocusSession({ sessionId, durationMs }) {
  await ensureStorageDefaults();
  sessionId = String(sessionId || "");
  durationMs = clampMs(durationMs, 3 * 60 * 60 * 1000);
  const stats = await getFreshStats();
  const settings = await getFreshSettings();

  if (!sessionId || stats.lastCompletedSessionId === sessionId) {
    return { ok: true, stats, duplicate: true };
  }

  const today = getTodayKey();
  const xpEarned = computeFocusXp(durationMs);
  const nextStreak = computeNextStreak(stats, today);

  const totalStudyMsToday = stats.totalStudyMsToday + durationMs;
  const nextStats = recordHistory({
    ...stats,
    totalStudyMsToday,
    totalStudyMsAllTime: stats.totalStudyMsAllTime + durationMs,
    focusSessionsToday: stats.focusSessionsToday + 1,
    streak: nextStreak,
    bestStreak: Math.max(stats.bestStreak, nextStreak),
    xp: stats.xp + xpEarned,
    lastFocusDate: today,
    lastCompletedSessionId: sessionId,
    lastCompletedBreakSessionId: "",
    lastSessionReport: {
      sessionId,
      completedAt: Date.now(),
      durationMs,
      xpEarned,
      streak: nextStreak,
      totalStudyMsToday,
      dailyGoalMinutes: settings.dailyGoalMinutes,
      goalPercent: Math.min(100, Math.round((totalStudyMsToday / 60000 / settings.dailyGoalMinutes) * 100))
    }
  }, { studyMs: durationMs, avoidedMs: 0, sessions: 1, xp: xpEarned });

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

async function notifyBreakComplete(sessionId) {
  sessionId = String(sessionId || "");
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

async function syncTimerAlarm() {
  await scheduleTimerAlarm(await getFreshTimer());
}

async function scheduleTimerAlarm(timer) {
  await updateBadge(timer);

  if (!chrome.alarms?.create) {
    return;
  }

  if (!timer.isRunning || !timer.endsAt) {
    await chrome.alarms.clear(TIMER_ALARM_NAME);
    return;
  }

  chrome.alarms.create(TIMER_ALARM_NAME, {
    when: Math.max(Date.now() + 1000, timer.endsAt)
  });
}

// Keeps the toolbar badge in sync with the timer: a live countdown while
// running, a pause mark for partially used sessions, blank when idle.
async function updateBadge(timer) {
  if (!chrome.action?.setBadgeText) {
    return;
  }

  try {
    if (!timer.isRunning) {
      await chrome.alarms.clear(BADGE_ALARM_NAME);
      const phaseDuration = getPhaseDuration(timer, timer.phase);
      const isPausedMidSession = timer.remainingMs > 0 && timer.remainingMs < phaseDuration;
      await chrome.action.setBadgeText({ text: isPausedMidSession ? "||" : "" });
      return;
    }

    chrome.alarms.create(BADGE_ALARM_NAME, { periodInMinutes: 0.5 });
    const remaining = getTimerRemainingMs(timer);
    const text = remaining >= 60000
      ? `${Math.ceil(remaining / 60000)}m`
      : `${Math.max(1, Math.ceil(remaining / 1000))}s`;
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({
      color: timer.phase === "focus" ? "#1f8f66" : "#3b6ea5"
    });
  } catch (_error) {
    // Badge cosmetics must never break timer bookkeeping.
  }
}

// The single owner of timer phase transitions. The popup and content script
// only report expiry (YFM_TIMER_EXPIRED); they never write the next phase.
async function advanceTimerIfExpired(message = {}) {
  const timer = await getFreshTimer();
  if (!timer.isRunning || getTimerRemainingMs(timer) > 0) {
    await scheduleTimerAlarm(timer);
    return timer;
  }

  // A stale expiry report for a session that already advanced.
  if (message.sessionId && timer.sessionId && message.sessionId !== timer.sessionId) {
    return timer;
  }

  const completed = { ...timer };
  const settings = await getFreshSettings();
  const now = Date.now();

  let nextPhase;
  let nextDuration;
  let nextIsLongBreak = false;
  let nextCycleCount = completed.cycleCount || 0;

  if (completed.phase === "focus") {
    const phaseDuration = completed.durationMs || getPhaseDuration(completed, "focus");
    // Credit actual elapsed time, not the configured duration, so editing
    // session lengths mid-run cannot inflate stats.
    const elapsedMs = clampMs(
      completed.startedAt ? now - completed.startedAt : phaseDuration,
      phaseDuration
    );
    await completeFocusSession({ sessionId: completed.sessionId, durationMs: elapsedMs });

    nextPhase = "break";
    nextCycleCount += 1;
    const dueForLongBreak = nextCycleCount % settings.sessionsUntilLongBreak === 0;
    if (dueForLongBreak) {
      nextIsLongBreak = true;
      nextDuration = settings.longBreakMinutes * 60 * 1000;
      nextCycleCount = 0;
    } else {
      nextDuration = completed.breakMs;
    }
  } else {
    await notifyBreakComplete(completed.sessionId);
    nextPhase = "focus";
    nextDuration = completed.focusMs;
  }

  // Breaks always start on their own; the next focus block only auto-starts
  // when the user opts in.
  const autoRun = nextPhase === "break" || settings.autoStartNextFocus;
  const nextTimer = normalizeTimer({
    ...completed,
    phase: nextPhase,
    durationMs: nextDuration,
    remainingMs: nextDuration,
    isRunning: autoRun,
    startedAt: autoRun ? now : 0,
    endsAt: autoRun ? now + nextDuration : 0,
    isLongBreak: nextIsLongBreak,
    cycleCount: nextCycleCount,
    sessionId: createSessionId()
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.timer]: nextTimer });
  await scheduleTimerAlarm(nextTimer);
  return nextTimer;
}

function startTimer(timer) {
  return buildStartedTimer(timer);
}

function pauseTimer(timer) {
  return buildPausedTimer(timer);
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
