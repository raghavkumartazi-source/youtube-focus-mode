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
  statsExtra: document.getElementById("statsExtra"),
  goalTitle: document.getElementById("goalTitle"),
  goalPercent: document.getElementById("goalPercent"),
  goalBar: document.getElementById("goalBar"),
  historyChart: document.getElementById("historyChart"),
  focusMinutes: document.getElementById("focusMinutes"),
  breakMinutes: document.getElementById("breakMinutes"),
  dailyGoalMinutes: document.getElementById("dailyGoalMinutes"),
  longBreakMinutes: document.getElementById("longBreakMinutes"),
  sessionsUntilLongBreak: document.getElementById("sessionsUntilLongBreak"),
  autoStartNextFocus: document.getElementById("autoStartNextFocus"),
  ambientSound: document.getElementById("ambientSound"),
  ambientVolume: document.getElementById("ambientVolume"),
  grayscale: document.getElementById("grayscale"),
  hideShorts: document.getElementById("hideShorts"),
  hideSidebar: document.getElementById("hideSidebar"),
  hideHomeFeed: document.getElementById("hideHomeFeed"),
  hideComments: document.getElementById("hideComments"),
  blockAutoplay: document.getElementById("blockAutoplay"),
  strictMode: document.getElementById("strictMode"),
  widgetEnabled: document.getElementById("widgetEnabled"),
  blockScreen: document.getElementById("blockScreen"),
  notificationsEnabled: document.getElementById("notificationsEnabled"),
  soundAlerts: document.getElementById("soundAlerts"),
  saveStatus: document.getElementById("saveStatus"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataBtn: document.getElementById("importDataBtn"),
  importDataInput: document.getElementById("importDataInput"),
  dataStatus: document.getElementById("dataStatus"),
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
    "grayscale",
    "hideShorts",
    "hideSidebar",
    "hideHomeFeed",
    "hideComments",
    "blockAutoplay",
    "strictMode",
    "widgetEnabled",
    "blockScreen",
    "notificationsEnabled",
    "soundAlerts",
    "autoStartNextFocus"
  ];

  for (const id of settingInputs) {
    els[id].addEventListener("change", () => {
      updateSettings({ [id]: els[id].checked });
    });
  }

  for (const id of ["dailyGoalMinutes", "ambientVolume", "ambientSound", "longBreakMinutes", "sessionsUntilLongBreak"]) {
    els[id].addEventListener("input", () => {
      updateSettings({
        dailyGoalMinutes: Number(els.dailyGoalMinutes.value),
        ambientVolume: Number(els.ambientVolume.value),
        ambientSound: els.ambientSound.value,
        longBreakMinutes: Number(els.longBreakMinutes.value),
        sessionsUntilLongBreak: Number(els.sessionsUntilLongBreak.value)
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

  els.exportDataBtn.addEventListener("click", exportData);
  els.importDataBtn.addEventListener("click", () => els.importDataInput.click());
  els.importDataInput.addEventListener("change", importData);
}

function render() {
  els.studyMode.checked = state.settings.studyMode;
  els.totalToday.textContent = formatDuration(state.stats.totalStudyMsToday);
  els.avoidedToday.textContent = formatDuration(state.stats.avoidedMsToday);
  els.streak.textContent = `${state.stats.streak} ${state.stats.streak === 1 ? "day" : "days"}`;
  els.xpLevel.textContent = `Level ${Math.floor(state.stats.xp / 100) + 1}`;

  const bestStreak = Math.max(state.stats.streak, state.stats.bestStreak);
  els.statsExtra.textContent =
    `Best streak ${bestStreak} ${bestStreak === 1 ? "day" : "days"} · All-time focus ${formatDuration(state.stats.totalStudyMsAllTime)}`;

  const todayMinutes = Math.floor(state.stats.totalStudyMsToday / 60000);
  const goalMinutes = state.settings.dailyGoalMinutes;
  const goalPercent = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100));
  els.goalTitle.textContent = `${todayMinutes} / ${goalMinutes} min`;
  els.goalPercent.textContent = `${goalPercent}%`;
  els.goalBar.style.width = `${goalPercent}%`;

  els.focusMinutes.value = Math.round(state.timer.focusMs / 60000);
  els.breakMinutes.value = Math.round(state.timer.breakMs / 60000);
  els.dailyGoalMinutes.value = state.settings.dailyGoalMinutes;
  els.longBreakMinutes.value = state.settings.longBreakMinutes;
  els.sessionsUntilLongBreak.value = state.settings.sessionsUntilLongBreak;
  els.ambientSound.value = state.settings.ambientSound;
  els.ambientVolume.value = state.settings.ambientVolume;

  for (const id of [
    "grayscale",
    "hideShorts",
    "hideSidebar",
    "hideHomeFeed",
    "hideComments",
    "blockAutoplay",
    "strictMode",
    "widgetEnabled",
    "blockScreen",
    "notificationsEnabled",
    "soundAlerts",
    "autoStartNextFocus"
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
  const currentDuration = getPhaseDuration(state.timer, state.timer.phase);
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

function setSaveStatus(label) {
  els.saveStatus.textContent = label;
}

async function exportData() {
  setDataStatus("Exporting");
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const payload = {
    app: "youtube-focus-mode",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: stored
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `youtube-focus-mode-backup-${getTodayKey()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setDataStatus("Exported");
}

async function importData(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    const source = parsed && typeof parsed.data === "object" && parsed.data ? parsed.data : parsed;
    const next = {};
    if (source[STORAGE_KEYS.settings]) {
      next[STORAGE_KEYS.settings] = normalizeSettings(source[STORAGE_KEYS.settings]);
    }
    if (source[STORAGE_KEYS.stats]) {
      next[STORAGE_KEYS.stats] = normalizeStats(source[STORAGE_KEYS.stats]);
    }
    if (source[STORAGE_KEYS.timer]) {
      next[STORAGE_KEYS.timer] = normalizeTimer(source[STORAGE_KEYS.timer]);
    }
    if (source[STORAGE_KEYS.widgetPosition]) {
      next[STORAGE_KEYS.widgetPosition] = normalizePosition(source[STORAGE_KEYS.widgetPosition]);
    }

    if (!Object.keys(next).length) {
      throw new Error("No recognizable YouTube Focus Mode data found.");
    }

    await chrome.storage.local.set(next);
    await hydrateState();
    render();
    setDataStatus("Imported");
  } catch (_error) {
    setDataStatus("Import failed");
  }
}

function setDataStatus(label) {
  els.dataStatus.textContent = label;
}
