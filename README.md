# YouTube Focus Mode

A Manifest V3 Chrome extension that removes YouTube distractions while studying.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `youtube distraction off`.
5. Open YouTube, then use the extension popup to turn Study Mode on or off.

## What It Does

- Hides Shorts, the recommended sidebar, and the YouTube homepage feed.
- Keeps search, subscriptions, and the current video usable.
- Adds a draggable 25/5 Pomodoro widget on YouTube.
- Adds animated progress rings in the popup and floating widget.
- Tracks study time, estimated distraction time avoided, daily streak, focus sessions, XP, and 7-day history.
- Blocks autoplay, optionally hides comments, supports educational channel whitelisting, and includes ambient focus audio.
- Includes a full options dashboard for timer lengths, daily goals, strict blocking, notifications, soundscapes, volume, and whitelist management.
- Adds Chrome notifications, soft sound alerts, a Shorts block screen, and keyboard shortcuts.
- Saves all settings with `chrome.storage.local`.

## Keyboard Shortcuts

- `Ctrl/Command + Shift + Y` - Toggle Study Mode.
- `Ctrl/Command + Shift + U` - Start or pause the Pomodoro timer.
- `Ctrl/Command + Shift + M` - Toggle ambient sound.

## Files

- `manifest.json` - Chrome extension manifest.
- `popup.html` - Extension popup layout.
- `styles.css` - Popup styling.
- `popup.js` - Popup settings, timer, stats, whitelist, and ambient controls.
- `content.js` - YouTube cleanup, floating timer widget, autoplay blocking, and activity tracking.
- `background.js` - MV3 service worker for defaults, daily stat resets, streaks, and XP.
- `options.html` - Full dashboard and extension settings.
- `options.css` - Dashboard styling.
- `options.js` - Dashboard state, charts, settings, and timer configuration.
- `icon.svg` - Source icon artwork.
- `icon.png` - Extension and notification icon.
