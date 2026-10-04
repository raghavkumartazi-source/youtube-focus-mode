const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadShared } = require("./harness");

const {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  DEFAULT_TIMER,
  AMBIENT_SOUNDS,
  WIDGET_QUOTES,
  POPUP_QUOTES,
  normalizeSettings,
  normalizeStats,
  normalizeTimer,
  normalizePosition,
  normalizeSessionReport,
  normalizeChannelName,
  uniqueChannels,
  getPhaseDuration,
  getPhaseLabel,
  getTimerRemainingMs,
  buildStartedTimer,
  buildPausedTimer,
  buildResetTimer,
  computeFocusXp,
  computeNextStreak,
  getPreviousDayKey,
  getWidgetQuote,
  getPopupQuote,
  clampMs,
  clampNumber,
  numberOrDefault,
  getTodayKey,
  getHistoryCutoffKey,
  formatClock,
  formatDuration
} = loadShared();

test("normalizeSettings fills every default", () => {
  const settings = normalizeSettings({});
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(DEFAULT_SETTINGS).sort());
  assert.equal(settings.studyMode, true);
  assert.equal(settings.ambientSound, "rain");
  assert.equal(settings.dailyGoalMinutes, 120);
});

test("normalizeSettings rejects out-of-range numbers", () => {
  const settings = normalizeSettings({
    ambientVolume: 500,
    dailyGoalMinutes: 5,
    longBreakMinutes: 999,
    sessionsUntilLongBreak: 40
  });
  assert.equal(settings.ambientVolume, 100);
  assert.equal(settings.dailyGoalMinutes, 15);
  assert.equal(settings.longBreakMinutes, 60);
  assert.equal(settings.sessionsUntilLongBreak, 8);
});

test("normalizeSettings falls back on non-finite numbers", () => {
  const settings = normalizeSettings({
    ambientVolume: "loud",
    dailyGoalMinutes: NaN
  });
  assert.equal(settings.ambientVolume, DEFAULT_SETTINGS.ambientVolume);
  assert.equal(settings.dailyGoalMinutes, DEFAULT_SETTINGS.dailyGoalMinutes);
});

test("normalizeSettings coerces unknown ambient sounds back to the default", () => {
  assert.equal(normalizeSettings({ ambientSound: "helicopter" }).ambientSound, "rain");
  for (const sound of AMBIENT_SOUNDS) {
    assert.equal(normalizeSettings({ ambientSound: sound }).ambientSound, sound);
  }
});

test("normalizeSettings normalizes and dedupes the whitelist", () => {
  const settings = normalizeSettings({
    whitelistChannels: ["  @MIT  OpenCourseWare ", "mit opencourseware", "", "  ", "Khan Academy"]
  });
  // Display forms are kept verbatim so the UI reads naturally; deduping still
  // happens on the normalized key.
  assert.deepEqual(settings.whitelistChannels, ["@MIT OpenCourseWare", "Khan Academy"]);
});

test("normalizeSettings forces strict booleans", () => {
  const settings = normalizeSettings({ strictMode: 1, autoStartNextFocus: "yes" });
  assert.equal(settings.strictMode, true);
  assert.equal(settings.autoStartNextFocus, true);
});

test("the widget toggle defaults on and survives explicit opt-out", () => {
  assert.equal(normalizeSettings({}).widgetEnabled, true);
  assert.equal(normalizeSettings({ widgetEnabled: false }).widgetEnabled, false);
  assert.equal(normalizeSettings({ widgetEnabled: "off" }).widgetEnabled, true, "only false opts out");
});

test("normalizeStats coerces strings and drops garbage", () => {
  const stats = normalizeStats({
    totalStudyMsToday: "1200000",
    xp: "abc",
    streak: null,
    bestStreak: 7,
    history: null
  });
  assert.equal(stats.totalStudyMsToday, 1200000);
  assert.equal(stats.xp, 0);
  assert.equal(stats.streak, 0);
  assert.equal(stats.bestStreak, 7);
  assert.deepEqual(stats.history, {});
});

test("normalizeStats prunes history older than the cutoff", () => {
  const today = getTodayKey();
  const old = "2020-01-01";

  const stats = normalizeStats({
    history: {
      [old]: { studyMs: 5000 },
      [today]: { studyMs: 9000, sessions: 2 }
    }
  });
  assert.equal(Object.keys(stats.history).length, 1);
  assert.equal(stats.history["2020-01-01"], undefined);
  assert.deepEqual(stats.history[today], { studyMs: 9000, sessions: 2, xp: 0, avoidedMs: 0 });
});

test("normalizeSessionReport rejects non-objects and clamps goal percent", () => {
  assert.equal(normalizeSessionReport(null), null);
  assert.equal(normalizeSessionReport("nope"), null);
  const report = normalizeSessionReport({ sessionId: "abc", goalPercent: 250, durationMs: "x" });
  assert.equal(report.sessionId, "abc");
  assert.equal(report.goalPercent, 100);
  assert.equal(report.durationMs, 0);
});

test("normalizeTimer repairs missing and malformed fields", () => {
  const timer = normalizeTimer({ focusMs: "10", cycleCount: -3, isLongBreak: 1 });
  assert.equal(timer.focusMs, 10);
  assert.equal(timer.cycleCount, 0);
  assert.equal(timer.isLongBreak, true);
  assert.equal(timer.isRunning, false);
});

test("normalizePosition falls back to a sensible default", () => {
  assert.deepEqual(normalizePosition({}), { x: 24, y: 96 });
  assert.deepEqual(normalizePosition({ x: "50", y: "200" }), { x: 50, y: 200 });
});

test("normalizeChannelName strips handles, case, and stray spaces", () => {
  assert.equal(normalizeChannelName("  @Khan  Academy "), "khan academy");
  assert.equal(normalizeChannelName(""), "");
});

test("uniqueChannels keeps display names but dedupes by normalized key", () => {
  assert.deepEqual(uniqueChannels(["Khan Academy", "khan academy", "@Khan Academy"]), ["Khan Academy"]);
  assert.deepEqual(uniqueChannels([]), []);
});

test("phase helpers describe the current phase", () => {
  assert.equal(getPhaseDuration({ focusMs: 1000, breakMs: 500 }, "focus"), 1000);
  assert.equal(getPhaseDuration({ focusMs: 1000, breakMs: 500 }, "break"), 500);
  assert.equal(getPhaseLabel({ phase: "focus" }), "Focus");
  assert.equal(getPhaseLabel({ phase: "break", isLongBreak: false }), "Break");
  assert.equal(getPhaseLabel({ phase: "break", isLongBreak: true }), "Long Break");
});

test("getTimerRemainingMs reads remainingMs when idle and endsAt when running", () => {
  assert.equal(getTimerRemainingMs({ isRunning: false, remainingMs: 30000 }), 30000);
  assert.equal(getTimerRemainingMs({ isRunning: false, remainingMs: -5 }), 0);
  const running = { isRunning: true, endsAt: Date.now() + 10000, remainingMs: 0 };
  assert.ok(Math.abs(getTimerRemainingMs(running) - 10000) < 100);
});

test("buildStartedTimer starts a fresh session and preserves paused progress", () => {
  const fresh = buildStartedTimer(DEFAULT_TIMER);
  assert.equal(fresh.isRunning, true);
  assert.equal(fresh.phase, "focus");
  assert.equal(fresh.durationMs, DEFAULT_TIMER.focusMs);
  assert.ok(fresh.sessionId, "a fresh session needs an id");
  assert.ok(fresh.endsAt > Date.now());

  const paused = buildPausedTimer(buildStartedTimer(DEFAULT_TIMER));
  const resumed = buildStartedTimer(paused);
  assert.equal(resumed.durationMs, DEFAULT_TIMER.focusMs);
  assert.ok(resumed.endsAt > Date.now());
  assert.equal(resumed.sessionId, paused.sessionId, "resuming keeps the session id");
});

test("buildPausedTimer keeps the leftover time and clears the deadline", () => {
  const started = buildStartedTimer(DEFAULT_TIMER);
  const paused = buildPausedTimer(started);
  assert.equal(paused.isRunning, false);
  assert.equal(paused.startedAt, 0);
  assert.equal(paused.endsAt, 0);
  assert.ok(paused.remainingMs > 0);
});

test("buildResetTimer restores a full session with a new id", () => {
  const started = buildStartedTimer(DEFAULT_TIMER);
  const reset = buildResetTimer(started);
  assert.equal(reset.isRunning, false);
  assert.equal(reset.remainingMs, DEFAULT_TIMER.focusMs);
  assert.equal(reset.durationMs, DEFAULT_TIMER.focusMs);
  assert.notEqual(reset.sessionId, started.sessionId);
});

test("computeFocusXp rewards focus length, never session count alone", () => {
  assert.equal(computeFocusXp(25 * 60 * 1000), 25, "the classic 25 minute block stays at 25");
  assert.equal(computeFocusXp(5 * 60 * 1000), 5);
  assert.equal(computeFocusXp(2 * 60 * 1000), 5, "very short sessions still earn the minimum");
  assert.equal(computeFocusXp(0), 0);
  assert.equal(computeFocusXp(undefined), 0);
  assert.ok(computeFocusXp(60 * 60 * 1000) > 25, "a deep session out-earns a Pomodoro");
});

test("computeNextStreak continues, extends, and resets correctly", () => {
  const today = getTodayKey();
  const yesterday = getPreviousDayKey(today);
  const twoDaysAgo = getPreviousDayKey(yesterday);

  assert.equal(computeNextStreak({ streak: 3, lastFocusDate: today }, today), 3, "same day keeps the streak");
  assert.equal(computeNextStreak({ streak: 3, lastFocusDate: yesterday }, today), 4, "yesterday extends it");
  assert.equal(computeNextStreak({ streak: 3, lastFocusDate: twoDaysAgo }, today), 1, "a gap resets to one");
  assert.equal(computeNextStreak({ streak: 0, lastFocusDate: "" }, today), 1, "first session ever");
});

test("date helpers stay in sync", () => {
  const today = getTodayKey();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  // Stepping back twice must land two days before today.
  const twoDaysBack = getPreviousDayKey(getPreviousDayKey(today));
  assert.ok(twoDaysBack < today);
  assert.equal(getPreviousDayKey("2026-03-01"), "2026-02-28", "handles month boundaries");
  assert.equal(getPreviousDayKey("2024-03-01"), "2024-02-29", "handles leap years");
  assert.ok(getHistoryCutoffKey() < today);
});

test("formatClock and formatDuration render human readable times", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(90 * 1000), "01:30");
  assert.equal(formatClock(25 * 60 * 1000), "25:00");
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(45 * 60 * 1000), "45m");
  assert.equal(formatDuration(60 * 60 * 1000), "1h");
  assert.equal(formatDuration(95 * 60 * 1000), "1h 35m");
});

test("clamp helpers guard against bad input", () => {
  assert.equal(clampMs(5000, 1000), 1000);
  assert.equal(clampMs("x", 1000), 0);
  assert.equal(clampNumber(5, 1, 10, 3), 5);
  assert.equal(clampNumber("bad", 1, 10, 3), 3);
  assert.equal(numberOrDefault("7", 1), 7);
  assert.equal(numberOrDefault(NaN, 1), 1);
});

test("quote helpers always return a real string", () => {
  assert.ok(WIDGET_QUOTES.includes(getWidgetQuote()));
  assert.ok(POPUP_QUOTES.includes(getPopupQuote()));
});


test("grayscale defaults off and survives settings normalization", () => {
  const shared = loadShared();
  assert.equal(shared.normalizeSettings().grayscale, false);
  assert.equal(shared.normalizeSettings({ grayscale: true }).grayscale, true);
});

test("calendar keys use local midnight, including leap days", () => {
  const shared = loadShared();
  assert.equal(shared.getTodayKey(new Date(2024, 1, 29, 0, 1)), "2024-02-29");
  assert.equal(shared.getTodayKey(new Date(2024, 1, 29, 23, 59)), "2024-02-29");
  assert.equal(shared.getPreviousDayKey("2024-03-01"), "2024-02-29");
});
