// Test harness: loads the extension's plain (non-module) scripts into Node so
// they can be exercised without a browser. `shared.js` and `background.js` are
// written as classic scripts, so we eval them through `new Function` and hand
// back the top-level bindings that matter to the tests.

const fs = require("node:fs");
const path = require("node:path");

const SHARED_EXPORTS = [
  "STORAGE_KEYS",
  "DEFAULT_SETTINGS",
  "DEFAULT_STATS",
  "DEFAULT_TIMER",
  "AMBIENT_SOUNDS",
  "HISTORY_KEEP_DAYS",
  "WIDGET_QUOTES",
  "POPUP_QUOTES",
  "normalizeSettings",
  "normalizeStats",
  "normalizeTimer",
  "normalizePosition",
  "normalizeHistory",
  "normalizeSessionReport",
  "normalizeChannelName",
  "uniqueChannels",
  "getPhaseDuration",
  "getPhaseLabel",
  "getTimerRemainingMs",
  "buildStartedTimer",
  "buildPausedTimer",
  "buildResetTimer",
  "computeFocusXp",
  "computeNextStreak",
  "getPreviousDayKey",
  "getWidgetQuote",
  "getPopupQuote",
  "clampMs",
  "clampNumber",
  "numberOrDefault",
  "createSessionId",
  "getTodayKey",
  "getHistoryCutoffKey",
  "formatClock",
  "formatDuration"
];

const BACKGROUND_EXPORTS = [
  "ensureStorageDefaults",
  "getState",
  "trackActivity",
  "completeFocusSession",
  "notifyFocusComplete",
  "notifyBreakComplete",
  "resetDailyStatsIfNeeded",
  "getFreshSettings",
  "getFreshStats",
  "getFreshTimer",
  "toggleStudyMode",
  "toggleAmbient",
  "startPauseTimer",
  "syncTimerAlarm",
  "scheduleTimerAlarm",
  "updateBadge",
  "advanceTimerIfExpired",
  "startTimer",
  "pauseTimer",
  "recordHistory",
  "isDeepEqual"
];

function readProjectFile(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8");
}

function loadScript(source, exportNames, extraParams = {}) {
  const params = Object.keys(extraParams);
  const args = Object.values(extraParams);
  const body = `${source}\n; return { ${exportNames.join(", ")} };`;
  const factory = new Function(...params, body);
  return factory(...args);
}

// In-memory chrome.* surface covering exactly the APIs background.js touches.
function createChromeStub() {
  const store = {};
  const storageChangeListeners = [];
  const alarmListeners = [];
  const notificationClickListeners = [];
  const commandListeners = [];
  const messageListeners = [];
  const scheduledAlarms = {};
  const notificationsCreated = [];
  const badge = { text: "", color: "" };
  let notificationSeq = 0;

  function emitChange(changes) {
    for (const listener of storageChangeListeners) {
      listener(changes, "local");
    }
  }

  return {
    store,
    scheduledAlarms,
    notificationsCreated,
    badge,
    alarmListeners,
    commandListeners,
    messageListeners,

    runtime: {
      lastError: null,
      id: "test-extension-id",
      getURL: (file) => `chrome-extension://test-extension-id/${file}`,
      onInstalled: { addListener: (fn) => messageListeners.push(fn) },
      onStartup: { addListener: (fn) => messageListeners.push(fn) },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      sendMessage: (message, callback) => {
        if (callback) {
          callback({ ok: true });
        }
      }
    },
    commands: {
      onCommand: { addListener: (fn) => commandListeners.push(fn) }
    },
    alarms: {
      onAlarm: { addListener: (fn) => alarmListeners.push(fn) },
      create: (name, settings) => {
        scheduledAlarms[name] = settings || {};
      },
      clear: (name) => {
        delete scheduledAlarms[name];
      },
      clearAll: () => {
        Object.keys(scheduledAlarms).forEach((name) => delete scheduledAlarms[name]);
      }
    },
    notifications: {
      onClicked: { addListener: (fn) => notificationClickListeners.push(fn) },
      create: async (id, options) => {
        notificationsCreated.push({ id, options });
        return id || `n${notificationSeq += 1}`;
      },
      clear: () => Promise.resolve(true)
    },
    storage: {
      onChanged: { addListener: (fn) => storageChangeListeners.push(fn) },
      local: {
        get: async (keys) => {
          if (keys === null || keys === undefined) {
            return { ...store };
          }
          const requested = Array.isArray(keys) ? keys : [keys];
          const result = {};
          for (const key of requested) {
            if (Object.prototype.hasOwnProperty.call(store, key)) {
              result[key] = store[key];
            }
          }
          return result;
        },
        set: async (values) => {
          const changes = {};
          for (const [key, newValue] of Object.entries(values)) {
            const oldValue = store[key];
            store[key] = newValue;
            changes[key] = { oldValue, newValue };
          }
          emitChange(changes);
        }
      }
    },
    action: {
      setBadgeText: async (options) => {
        badge.text = options.text;
      },
      setBadgeBackgroundColor: async (options) => {
        badge.color = options.color;
      }
    },
    tabs: {
      query: async () => [],
      update: async () => {},
      create: async () => ({ id: 1 })
    },
    windows: {
      update: async () => {}
    }
  };
}

function loadShared() {
  return loadScript(readProjectFile("shared.js"), SHARED_EXPORTS, {
    crypto: globalThis.crypto
  });
}

function loadBackground(chrome) {
  const shared = readProjectFile("shared.js");
  const background = readProjectFile("background.js");
  // background.js opens with importScripts("shared.js"); inline shared.js in
  // its place so both scripts share one function scope.
  const combined = background.replace(
    /^importScripts\("shared\.js"\);/,
    shared
  );
  return loadScript(combined, BACKGROUND_EXPORTS, { chrome, crypto: globalThis.crypto });
}

module.exports = {
  loadShared,
  loadBackground,
  createChromeStub,
  readProjectFile
};
