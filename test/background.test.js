const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadBackground, loadShared, createChromeStub } = require("./harness");

const FOCUS_MS = 25 * 60 * 1000;
const BREAK_MS = 5 * 60 * 1000;

function setup() {
  const chrome = createChromeStub();
  const background = loadBackground(chrome);
  return { chrome, background };
}

async function seedRunningFocusTimer(chrome, background, overrides = {}) {
  const timer = background.startTimer({
    phase: "focus",
    focusMs: FOCUS_MS,
    breakMs: BREAK_MS,
    durationMs: FOCUS_MS,
    remainingMs: FOCUS_MS,
    isRunning: false,
    isLongBreak: false,
    cycleCount: 0,
    startedAt: 0,
    endsAt: 0,
    sessionId: ""
  });
  const merged = { ...timer, ...overrides };
  await chrome.storage.local.set({ yfmTimer: merged });
  return merged;
}

test("completeFocusSession credits time, xp, streak, and history", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();

  const result = await background.completeFocusSession({
    sessionId: "session-1",
    durationMs: FOCUS_MS
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.focusSessionsToday, 1);
  assert.equal(result.stats.totalStudyMsAllTime, FOCUS_MS);
  assert.equal(result.stats.xp, 25);
  assert.equal(result.stats.streak, 1);
  assert.equal(result.stats.bestStreak, 1);
  assert.equal(result.stats.lastFocusDate, loadShared().getTodayKey());
  assert.equal(result.stats.lastCompletedSessionId, "session-1");

  const stored = (await chrome.storage.local.get("yfmStats")).yfmStats;
  const today = loadShared().getTodayKey();
  assert.equal(stored.history[today].sessions, 1);
  assert.equal(stored.history[today].xp, 25);
  assert.equal(stored.history[today].studyMs, FOCUS_MS);

  assert.ok(chrome.notificationsCreated.length === 1);
  assert.equal(chrome.notificationsCreated[0].options.title, "Focus session complete");
});

test("completeFocusSession is idempotent per session id", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();

  const first = await background.completeFocusSession({ sessionId: "s1", durationMs: FOCUS_MS });
  const second = await background.completeFocusSession({ sessionId: "s1", durationMs: FOCUS_MS });

  assert.equal(second.duplicate, true);
  assert.equal(second.stats.focusSessionsToday, 1, "a replayed session must not double count");
  assert.equal(second.stats.totalStudyMsAllTime, first.stats.totalStudyMsAllTime);
  assert.equal(second.stats.lastCompletedSessionId, first.stats.lastCompletedSessionId);
});

test("completeFocusSession skips notifications when disabled", async () => {
  const { chrome, background } = setup();
  await chrome.storage.local.set({
    yfmSettings: { notificationsEnabled: false, dailyGoalMinutes: 120, sessionsUntilLongBreak: 4 }
  });

  await background.completeFocusSession({ sessionId: "s1", durationMs: FOCUS_MS });
  assert.equal(chrome.notificationsCreated.length, 0);
});

test("a completed focus session moves to a break and counts the cycle", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();
  const timer = await seedRunningFocusTimer(chrome, background, {
    endsAt: Date.now() - 1000,
    remainingMs: 0
  });

  const next = await background.advanceTimerIfExpired({ sessionId: timer.sessionId });

  assert.equal(next.phase, "break");
  assert.equal(next.isRunning, true, "breaks auto-start");
  assert.equal(next.isLongBreak, false);
  assert.equal(next.cycleCount, 1);
  assert.equal(next.durationMs, BREAK_MS);
  assert.notEqual(next.sessionId, timer.sessionId);
  assert.ok(next.endsAt > Date.now());
});

test("the configured session count triggers a long break and resets the cycle", async () => {
  const { chrome, background } = setup();
  await chrome.storage.local.set({
    yfmSettings: { sessionsUntilLongBreak: 2, dailyGoalMinutes: 120 }
  });
  const timer = await seedRunningFocusTimer(chrome, background, {
    endsAt: Date.now() - 1000,
    remainingMs: 0,
    cycleCount: 1
  });

  const next = await background.advanceTimerIfExpired({ sessionId: timer.sessionId });

  assert.equal(next.phase, "break");
  assert.equal(next.isLongBreak, true);
  assert.equal(next.cycleCount, 0, "the long break consumes the cycle");
  assert.equal(next.durationMs, 15 * 60 * 1000);
});

test("a completed break returns to focus and waits for the user", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();
  await chrome.storage.local.set({
    yfmTimer: background.startTimer({
      phase: "break",
      focusMs: FOCUS_MS,
      breakMs: BREAK_MS,
      durationMs: BREAK_MS,
      remainingMs: BREAK_MS,
      isRunning: false,
      cycleCount: 1,
      sessionId: ""
    })
  });
  const stored = (await chrome.storage.local.get("yfmTimer")).yfmTimer;
  await chrome.storage.local.set({
    yfmTimer: { ...stored, isRunning: true, endsAt: Date.now() - 1000, remainingMs: 0 }
  });

  const next = await background.advanceTimerIfExpired({ sessionId: stored.sessionId });

  assert.equal(next.phase, "focus");
  assert.equal(next.isRunning, false, "focus waits for an explicit start by default");
  assert.equal(next.durationMs, FOCUS_MS);
  assert.equal(next.cycleCount, 1);
});

test("auto-start chains focus blocks back to back", async () => {
  const { chrome, background } = setup();
  await chrome.storage.local.set({
    yfmSettings: { autoStartNextFocus: true, dailyGoalMinutes: 120 }
  });
  await background.ensureStorageDefaults();
  await chrome.storage.local.set({
    yfmSettings: { autoStartNextFocus: true, dailyGoalMinutes: 120 }
  });
  const timer = await seedRunningFocusTimer(chrome, background, {
    phase: "break",
    durationMs: BREAK_MS,
    remainingMs: BREAK_MS,
    endsAt: Date.now() - 1000
  });

  const next = await background.advanceTimerIfExpired({ sessionId: timer.sessionId });

  assert.equal(next.phase, "focus");
  assert.equal(next.isRunning, true, "auto-start launches the next focus block");
});

test("an expired timer credits elapsed time, not the configured length", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();
  const startedAt = Date.now() - 10 * 60 * 1000;
  const timer = await seedRunningFocusTimer(chrome, background, {
    startedAt,
    endsAt: Date.now() - 1000,
    remainingMs: 0
  });

  await background.advanceTimerIfExpired({ sessionId: timer.sessionId });

  const stats = (await chrome.storage.local.get("yfmStats")).yfmStats;
  const credited = stats.totalStudyMsAllTime;
  assert.ok(credited >= 9 * 60 * 1000 && credited <= 11 * 60 * 1000, `credited ~10 minutes, got ${credited}`);
});

test("a running timer with time left is left untouched", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();
  const timer = await seedRunningFocusTimer(chrome, background);

  const next = await background.advanceTimerIfExpired({ sessionId: timer.sessionId });

  assert.equal(next.phase, "focus");
  assert.equal(next.sessionId, timer.sessionId);
  assert.equal(next.isRunning, true);
});

test("startPauseTimer toggles running state", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();

  await background.startPauseTimer();
  let timer = (await chrome.storage.local.get("yfmTimer")).yfmTimer;
  assert.equal(timer.isRunning, true);

  await background.startPauseTimer();
  timer = (await chrome.storage.local.get("yfmTimer")).yfmTimer;
  assert.equal(timer.isRunning, false);
  assert.equal(timer.endsAt, 0);
});

test("resetDailyStatsIfNeeded zeroes the day when the date rolls over", async () => {
  const { chrome, background } = setup();
  await chrome.storage.local.set({
    yfmStats: {
      date: "2020-01-01",
      totalStudyMsToday: 5000,
      focusSessionsToday: 3,
      streak: 2,
      history: {}
    }
  });

  const reset = await background.resetDailyStatsIfNeeded();

  assert.equal(reset.totalStudyMsToday, 0);
  assert.equal(reset.focusSessionsToday, 0);
  assert.equal(reset.streak, 2, "streaks survive the day rollover");
  assert.notEqual(reset.date, "2020-01-01");
});

test("resetDailyStatsIfNeeded is a no-op on the same day", async () => {
  const { chrome, background } = setup();
  await chrome.storage.local.set({
    yfmStats: {
      date: loadShared().getTodayKey(),
      totalStudyMsToday: 5000,
      focusSessionsToday: 3,
      history: {}
    }
  });

  const reset = await background.resetDailyStatsIfNeeded();
  assert.equal(reset.totalStudyMsToday, 5000);
  assert.equal(reset.focusSessionsToday, 3);
});

test("trackActivity accumulates study and avoided time", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();

  await background.trackActivity({ studyMs: 30000, avoidedMs: 10000 });
  await background.trackActivity({ studyMs: 30000, avoidedMs: 10000 });

  const stats = (await chrome.storage.local.get("yfmStats")).yfmStats;
  assert.equal(stats.totalStudyMsToday, 60000);
  assert.equal(stats.avoidedMsToday, 20000);
  assert.equal(stats.totalStudyMsAllTime, 60000);
});

test("trackActivity clamps implausible bursts", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();

  await background.trackActivity({ studyMs: 99 * 60 * 60 * 1000, avoidedMs: 99 * 60 * 60 * 1000 });

  const stats = (await chrome.storage.local.get("yfmStats")).yfmStats;
  assert.ok(stats.totalStudyMsToday <= 60 * 60 * 1000);
  assert.ok(stats.avoidedMsToday <= 60 * 60 * 1000);
});

test("ensureStorageDefaults writes only when storage actually changes", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();
  const writesBefore = chrome.notificationsCreated.length;
  await background.ensureStorageDefaults();
  await background.ensureStorageDefaults();
  assert.equal(writesBefore, chrome.notificationsCreated.length);
});

test("getState returns fully normalized values", async () => {
  const { chrome, background } = setup();
  await chrome.storage.local.set({ yfmSettings: { dailyGoalMinutes: 999 } });

  const state = await background.getState();

  assert.equal(state.settings.dailyGoalMinutes, 600, "getState normalizes what it reads");
  assert.equal(typeof state.timer.remainingMs, "number");
  assert.deepEqual(state.widgetPosition, { x: 24, y: 96 });
});

test("notifyBreakComplete dedupes by session id", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();

  const first = await background.notifyBreakComplete("break-1");
  const second = await background.notifyBreakComplete("break-1");

  assert.equal(first.notified, true);
  assert.equal(second.notified, false);
  assert.equal(second.duplicate, true);
  assert.equal(chrome.notificationsCreated.length, 1);
});

test("scheduleTimerAlarm arms an alarm for a running timer and clears it when idle", async () => {
  const { chrome, background } = setup();
  await background.ensureStorageDefaults();
  const timer = await seedRunningFocusTimer(chrome, background);

  await background.scheduleTimerAlarm(timer);
  assert.ok(chrome.scheduledAlarms["yfm-timer-complete"], "a running timer arms the completion alarm");

  await background.scheduleTimerAlarm(background.pauseTimer(timer));
  assert.equal(chrome.scheduledAlarms["yfm-timer-complete"], undefined, "pausing clears the alarm");
});

test("isDeepEqual handles primitives, objects, and arrays", () => {
  const { background } = setup();
  assert.equal(background.isDeepEqual(1, 1), true);
  assert.equal(background.isDeepEqual(1, "1"), false);
  assert.equal(background.isDeepEqual(null, null), true);
  assert.equal(background.isDeepEqual(null, {}), false);
  assert.equal(background.isDeepEqual({ a: 1 }, { a: 1 }), true);
  assert.equal(background.isDeepEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(background.isDeepEqual([1, 2], [1, 2]), true);
  assert.equal(background.isDeepEqual([1, 2], { 0: 1, 1: 2 }), false);
});
