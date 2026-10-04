# 🎯 YouTube Focus Mode

> **Turn YouTube into a study tool, not a distraction machine.**

YouTube Focus Mode is a modern Chrome extension built for **students, developers, and anyone who wants to use YouTube without falling into the endless-scroll trap.**

It removes distracting parts of YouTube — like **Shorts, recommendations, autoplay, and feeds** — while adding productivity features such as **Pomodoro sessions, focus streaks, XP, analytics, ambient sounds, and study goals.**

---

## ✨ Why YouTube Focus Mode?

YouTube is an incredible learning platform.

The problem?

> You open YouTube to watch one lecture... and somehow you're watching a 47-minute video about why cats are afraid of cucumbers. 💀

YouTube Focus Mode keeps the useful part of YouTube while getting rid of the distractions.

### Before

**Open YouTube → Homepage → Recommended video → Shorts → Another video → 2 hours gone**

### After

**Open YouTube → Search for what you need → Study → Close YouTube**

---

# 🚀 Features

## 🧠 Distraction-Free YouTube

Remove the parts of YouTube that encourage endless browsing.

* 🚫 Hide YouTube Shorts
* 🚫 Hide recommended videos
* 🚫 Hide homepage feed
* 🚫 Hide recommended sidebar
* 🚫 Optional comment blocker
* 🚫 Automatically disable autoplay
* 🎯 Keep search and educational content accessible

---

## ⏳ Productivity System

Turn study sessions into measurable progress.

* 🍅 Built-in Pomodoro timer
* 🔥 Daily focus streaks
* ⭐ XP and progression system
* 📊 Focus session analytics
* 🎯 Daily study goals
* ⏱️ Track total focus time

---

## 🎵 Deep Focus Mode

Create a better environment for long study sessions.

* 🌧️ Ambient background sounds
* 🎧 Focus-friendly audio
* 🪟 Floating draggable focus widget
* 🔔 Smart notifications
* 🧘 Minimal-distraction interface

---

## ⚙️ Customization

You decide how strict Focus Mode should be.

* 🔘 Study Mode ON/OFF
* 📚 Whitelist educational channels
* 🔊 Adjustable ambient sound volume
* 🎯 Custom study goals
* 💾 Persistent settings
* 🧩 Local storage for user preferences

---

## 🎨 Modern UI

Designed to stay out of your way.

* 🌑 Modern dark interface
* ✨ Smooth animations
* ⚡ Lightweight and fast
* 📱 Responsive popup UI
* 🎯 Productivity-focused design
* 🧹 Minimal visual clutter

---

# 📦 Installation

There are **two ways** to install YouTube Focus Mode.

## 🟢 Option 1 — Download the Latest Release

**Recommended for normal users.**

1. Download the repository ZIP from **Code → Download ZIP**, or a tested extension ZIP from **Actions → CI → Artifacts** when CI succeeds.
2. Extract the downloaded `.zip` file.
3. Open Chrome.
4. Go to:

```text
chrome://extensions
```

5. Enable **Developer mode** in the top-right corner.
6. Click **Load unpacked**.
7. Select the extracted **YouTube Focus Mode** folder.
8. Done! 🎉

You should now see the YouTube Focus Mode extension in Chrome.

### 📌 Important

When selecting the folder, select the folder containing:

```text
manifest.json
```

Do **not** select the ZIP file itself.

---

# ⚡ Quick Installation

For the fastest setup:

```text
Download ZIP
     ↓
Extract ZIP
     ↓
chrome://extensions
     ↓
Developer mode ON
     ↓
Load unpacked
     ↓
Select project folder
     ↓
🎯 Focus Mode Ready
```

---

# 🛠️ Installation for Developers

Want to modify the extension or contribute to the project?

### 1. Clone the repository

```bash
git clone https://github.com/raghavkumartazi-source/youtube-focus-mode.git
cd youtube-focus-mode
```

### 2. Install dependencies

If the project uses npm:

```bash
npm install
```

### 3. Build the extension

```bash
npm run package
```

There is no JavaScript build step. Packaging requires Python 3 and creates a ZIP in `dist/`.

### 4. Load the extension in Chrome

Open:

```text
chrome://extensions
```

Then:

1. Enable **Developer mode**
2. Click **Load unpacked**
3. Select the unpacked project folder containing manifest.json
4. Open YouTube
5. Turn on **Focus Mode**

---

# 🔄 Updating the Extension

If you installed the extension using **Load unpacked**:

1. Pull/download the latest project files.
2. Return to:

```text
chrome://extensions
```

3. Find **YouTube Focus Mode**.
4. Click the **Reload ↻** button.

Your updated version will be loaded immediately.

---

# 🎯 How to Use

After installation:

### 1. Open YouTube

Go to:

```text
https://www.youtube.com
```

### 2. Open YouTube Focus Mode

Click the extension icon in Chrome.

### 3. Enable Study Mode

Turn on:

> **🎯 Study Mode**

YouTube will automatically become a cleaner study environment.

### 4. Start a Focus Session

Choose your desired focus duration and start the Pomodoro timer.

### 5. Study

Use YouTube for what you actually came for.

### 6. Track your progress

Your focus time, streaks, XP, and study statistics are stored locally.

---

# 🧩 Recommended Study Setup

For maximum distraction resistance:

| Setting         | Recommended |
| --------------- | ----------- |
| Study Mode      | ✅ ON        |
| Shorts          | 🚫 Hidden   |
| Recommendations | 🚫 Hidden   |
| Homepage Feed   | 🚫 Hidden   |
| Autoplay        | 🚫 OFF      |
| Comments        | 🚫 Blocked  |
| Pomodoro        | 🍅 50 min   |
| Break           | ☕ 10 min    |
| Ambient Sound   | 🎧 Optional |

---

# 🗂️ Project Structure

```text
youtube-focus-mode/
│
├── manifest.json
│
├── src/
│   ├── popup/
│   ├── content/
│   ├── background/
│   ├── components/
│   └── styles/
│
├── assets/
│   ├── icons/
│   └── sounds/
│
├── README.md
├── package.json
└── LICENSE
```

> The exact structure may change as the project evolves.

---

# 🔐 Privacy

YouTube Focus Mode is designed with a **local-first approach**.

Your:

* Focus sessions
* Streaks
* XP
* Study goals
* Preferences

can be stored locally in the browser.

The extension should not require access to your YouTube account or personal YouTube data to provide its core productivity features.

For complete details, see the project's privacy policy.

---

# ⚡ Performance

YouTube Focus Mode is designed to be:

* Lightweight
* Fast
* Low resource usage
* Non-intrusive
* Focused on modifying only the parts of YouTube necessary for productivity

---

# 🧑‍💻 Contributing

Contributions are welcome! ❤️

If you have an idea for improving YouTube Focus Mode:

1. Fork the repository.
2. Create a feature branch.

```bash
git checkout -b feature/my-new-feature
```

3. Make your changes.
4. Test the extension in Chrome.
5. Commit your changes.

```bash
git commit -m "Add my new feature"
```

6. Push the branch.

```bash
git push origin feature/my-new-feature
```

7. Open a Pull Request.

---

# 💡 Ideas & Feature Requests

Have an idea?

Open a GitHub Issue and describe:

* What problem it solves
* How the feature should work
* Why it would improve the study experience

Some potential future features:

* 📅 Study schedules
* 📈 Advanced analytics
* 🏆 Achievements
* 🤖 AI-powered study recommendations
* 📚 Learning playlists
* 🎯 Subject-specific goals
* 🔥 Weekly productivity reports
* 🌐 Support for additional browsers

---

# 🐛 Found a Bug?

Please open a GitHub Issue with:

```text
Browser:
Chrome Version:
Extension Version:

What happened?

What did you expect to happen?

Steps to reproduce:
1.
2.
3.
```

Screenshots and console errors are extremely helpful.

---

# 🌐 Browser Support

| Browser        | Support     |
| -------------- | ----------- |
| Google Chrome  | ✅           |
| Microsoft Edge | 🟢 Expected |
| Brave          | 🟢 Expected |
| Chromium       | 🟢 Expected |
| Firefox        | 🔜 Planned  |

> Support may depend on the extension APIs used by the current version.

---

# 📜 License

This project is licensed under the **MIT License**.

See [`LICENSE`](LICENSE) for details.

---

# ⭐ Support the Project

If YouTube Focus Mode helps you study, consider:

⭐ **Star the repository**

🐛 **Report bugs**

💡 **Suggest features**

🤝 **Contribute**

And most importantly...

**Go study. 😭📚**

---

<div align="center">

### 🎯 YouTube Focus Mode

**YouTube for learning. Without the rabbit hole.**

Made with ❤️ for students and deep workers.

⭐ Star the project if it helps you focus.

</div>

## Validation and packaging

Run `npm run check`. CI tests UTC, Asia/Kolkata and America/Los_Angeles and packages only Chrome runtime files. Stats use your local calendar day. Grayscale is optional, works only while Study Mode is on, and affects videos/thumbnails rather than the focus controls.

No GitHub Release is currently published. Use the source ZIP or CI artifacts to load the extension unpacked. A YouTube layout change can still require browser verification.
