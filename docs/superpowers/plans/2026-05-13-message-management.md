# Message Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit the Whip-mode phrase pool and the list of quick modes from a Preferences window opened off the tray menu, with the existing `continue` / `looks good` modes migrated into the user-editable data.

**Architecture:** Extend `settings.json` with `whipPhrases` and `quickModes` arrays. Collapse the `MODES` enum so `CONTINUE` / `LOOKS_GOOD` become regular entries in `quickModes`. Make `sendMacro()` and `rebuildTrayMenu()` data-driven. Add a new `BrowserWindow` (`prefs.html` + `prefs-preload.js`) reachable from a new `Messages…` tray menu item, communicating with main through three IPC channels (`prefs:get`, `prefs:save`, `prefs:reset`).

**Tech Stack:** Electron 41, Node `fs`/`path`, vanilla HTML/CSS/JS in the renderer (no framework — consistent with `overlay.html`).

**Note on testing:** OpenWhip has no automated test suite. Each task ends with a manual verification step (launch the app, perform an action, observe the result). Don't add a test framework — that's outside scope.

---

## File Structure

**Modified:**
- `main.js` — `MODES` collapse, `DEFAULT_MESSAGES` constant, schema migration, data-driven dispatch + tray rebuild, three new IPC handlers, `openPrefsWindow()`, new tray menu entry.
- `package.json` — add `prefs.html` and `prefs-preload.js` to the `files` array.
- `README.md` — short "Messages" subsection under Modes.

**Created:**
- `prefs.html` — settings UI (two-section editor, footer with Reset / Done).
- `prefs-preload.js` — exposes `window.prefs` IPC bridge.

---

## Task 1: Add DEFAULT_MESSAGES and migrate settings persistence

**Files:**
- Modify: `main.js:100-137` (MODES block + loadSettings + saveSettings)

- [ ] **Step 1: Add module-scope state for the new fields**

Open `main.js`. Find this block (around line 100):

```js
// ── Globals ─────────────────────────────────────────────────────────────────
let tray, overlay, trayMenu;
let overlayReady = false;
let spawnQueued = false;
```

Add a `prefsWindow` global to that block:

```js
// ── Globals ─────────────────────────────────────────────────────────────────
let tray, overlay, trayMenu, prefsWindow;
let overlayReady = false;
let spawnQueued = false;
```

- [ ] **Step 2: Add DEFAULT_MESSAGES and migration variables**

Find the `MODES` block (around line 110). Replace this block:

```js
const MODES = {
  WHIP: 'whip',
  CONTINUE: 'continue',
  LOOKS_GOOD: 'looks_good',
  ENTER: 'enter',
};
const VALID_MODES = new Set(Object.values(MODES));
let macroMode = MODES.WHIP;
let settingsPath = null;
```

…with:

```js
const MODES = {
  WHIP: 'whip',
  ENTER: 'enter',
};

const DEFAULT_MESSAGES = {
  whipPhrases: [
    'FASTER',
    'FASTER',
    'FASTER',
    'GO FASTER',
    'Faster CLANKER',
    'Work FASTER',
    'Speed it up clanker',
  ],
  quickModes: [
    { id: 'continue',   label: 'continue',   text: 'continue'   },
    { id: 'looks_good', label: 'looks good', text: 'looks good' },
  ],
};

const MAX_MESSAGE_LEN = 200;

let macroMode = MODES.WHIP;
let whipPhrases = DEFAULT_MESSAGES.whipPhrases.slice();
let quickModes = DEFAULT_MESSAGES.quickModes.map(m => ({ ...m }));
let settingsPath = null;

function isValidMode(mode) {
  if (mode === MODES.WHIP || mode === MODES.ENTER) return true;
  return quickModes.some(m => m.id === mode);
}
```

- [ ] **Step 3: Replace loadSettings with migration-aware version**

Find `function loadSettings()` (around line 120). Replace the whole function:

```js
function loadSettings() {
  if (!settingsPath) return;
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      if (Array.isArray(s.whipPhrases)) {
        whipPhrases = s.whipPhrases.filter(x => typeof x === 'string');
      }
      if (Array.isArray(s.quickModes)) {
        quickModes = s.quickModes
          .filter(m => m && typeof m.id === 'string' && typeof m.label === 'string' && typeof m.text === 'string')
          .map(m => ({ id: m.id, label: m.label, text: m.text }));
      }
      if (typeof s.mode === 'string' && isValidMode(s.mode)) {
        macroMode = s.mode;
      } else {
        macroMode = MODES.WHIP;
      }
    }
  } catch { /* first run or corrupt — keep defaults */ }
}
```

- [ ] **Step 4: Replace saveSettings to persist all three fields**

Replace `function saveSettings()` with:

```js
function saveSettings() {
  if (!settingsPath) return;
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const payload = { mode: macroMode, whipPhrases, quickModes };
    fs.writeFileSync(settingsPath, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.warn('settings save failed:', e?.message || e);
  }
}
```

- [ ] **Step 5: Manually verify the migration**

```bash
# Wipe the existing settings file so migration runs from scratch.
rm -f "$HOME/Library/Application Support/openwhip/settings.json"
npm start
```

In a separate shell while the app is running:

```bash
cat "$HOME/Library/Application Support/openwhip/settings.json"
```

Expected: JSON with `mode: "whip"`, the seven phrases in `whipPhrases`, and the two `quickModes` entries (`continue`, `looks_good`). Quit the app.

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "Add DEFAULT_MESSAGES and migrate settings schema"
```

---

## Task 2: Make sendMacro data-driven

**Files:**
- Modify: `main.js:336-368` (sendMacro)

- [ ] **Step 1: Replace sendMacro body**

Find `function sendMacro(frontmost)` (around line 337). Replace the whole function:

```js
function sendMacro(frontmost) {
  if (macroMode === MODES.ENTER) {
    sendEnterOnly(frontmost);
    return;
  }
  if (macroMode === MODES.WHIP) {
    if (whipPhrases.length === 0) {
      sendEnterOnly(frontmost);
      return;
    }
    const chosen = whipPhrases[Math.floor(Math.random() * whipPhrases.length)];
    if (process.platform === 'win32') sendMacroWindows(chosen);
    else if (process.platform === 'darwin') sendMacroMac(chosen, frontmost);
    else if (process.platform === 'linux') sendMacroLinux(chosen);
    return;
  }
  const entry = quickModes.find(m => m.id === macroMode);
  if (entry) {
    sendTypeText(entry.text, frontmost);
    return;
  }
  // Active mode no longer exists — fall back to Whip and persist.
  console.warn(`openwhip: macroMode "${macroMode}" not found; falling back to WHIP`);
  macroMode = MODES.WHIP;
  saveSettings();
  sendMacro(frontmost);
}
```

- [ ] **Step 2: Verify continue still works**

```bash
npm start
```

Focus a terminal (Terminal.app or iTerm2). Right-click tray → Mode → `Type "continue" + Enter`. Left-click tray to spawn the whip. Whip the mouse. The terminal should receive `continue` + Enter.

If you have not granted Accessibility / Automation yet, that needs to be done first — but the behavior should match what it does today on `main`. Quit when done.

- [ ] **Step 3: Verify whip mode still picks a random phrase**

```bash
npm start
```

Focus a terminal. Right-click tray → Mode → `Whip`. Spawn the whip, crack it a few times. Each crack should send Ctrl+C + one of the seven phrases + Enter, same as before. Quit.

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "Drive sendMacro from whipPhrases and quickModes"
```

---

## Task 3: Make rebuildTrayMenu data-driven

**Files:**
- Modify: `main.js:538-578` (rebuildTrayMenu)

- [ ] **Step 1: Replace rebuildTrayMenu body**

Find `function rebuildTrayMenu()` (around line 543). Replace the whole function:

```js
function rebuildTrayMenu() {
  if (!tray) return;
  const quickModeItems = quickModes.map(m => ({
    label: `Type  "${m.label}"  + Enter`,
    type: 'radio',
    checked: macroMode === m.id,
    click: () => setMode(m.id),
  }));
  trayMenu = Menu.buildFromTemplate([
    {
      label: 'Mode',
      submenu: [
        {
          label: 'Whip  (Ctrl+C + phrase + Enter)',
          type: 'radio',
          checked: macroMode === MODES.WHIP,
          click: () => setMode(MODES.WHIP),
        },
        ...quickModeItems,
        {
          label: 'Press Enter only',
          type: 'radio',
          checked: macroMode === MODES.ENTER,
          click: () => setMode(MODES.ENTER),
        },
      ],
    },
    { type: 'separator' },
    { label: 'Messages…', click: () => openPrefsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}
```

- [ ] **Step 2: Add a stub openPrefsWindow so the menu doesn't crash**

Add this stub right above `function rebuildTrayMenu()`:

```js
function openPrefsWindow() {
  console.log('openPrefsWindow: not implemented yet');
}
```

(Task 7 will replace this with the real implementation.)

- [ ] **Step 3: Verify the tray menu still shows the same items in the same order**

```bash
npm start
```

Right-click tray. The Mode submenu should show, top to bottom: `Whip`, `Type "continue" + Enter`, `Type "looks good" + Enter`, `Press Enter only`. The tray menu itself should also show a `Messages…` item below Mode. Clicking `Messages…` should print `openPrefsWindow: not implemented yet` to the terminal. Quit.

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "Make tray Mode submenu data-driven from quickModes"
```

---

## Task 4: Create prefs-preload.js

**Files:**
- Create: `prefs-preload.js`

- [ ] **Step 1: Write the preload script**

Create `/opt/OpenWhip/prefs-preload.js`:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prefs', {
  getMessages: () => ipcRenderer.invoke('prefs:get'),
  saveMessages: (payload) => ipcRenderer.invoke('prefs:save', payload),
  resetDefaults: () => ipcRenderer.invoke('prefs:reset'),
});
```

- [ ] **Step 2: Commit**

```bash
git add prefs-preload.js
git commit -m "Add prefs-preload.js IPC bridge"
```

---

## Task 5: Create prefs.html

**Files:**
- Create: `prefs.html`

- [ ] **Step 1: Write the prefs window**

Create `/opt/OpenWhip/prefs.html`:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>OpenWhip · Messages</title>
<style>
  :root {
    --bg: #1c1c1c;
    --fg: #f3f3f3;
    --muted: #8a8a8a;
    --border: #333;
    --row-bg: #232323;
    --accent: #ff7a59;
    --danger: #b94747;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--fg);
    font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    height: 100%;
  }
  body { padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; }
  h2 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  .hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .warn { font-size: 11px; color: var(--accent); margin-top: 4px; }
  .list { border: 1px solid var(--border); border-radius: 8px; padding: 4px; max-height: 200px; overflow-y: auto; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border-radius: 6px; }
  .row + .row { margin-top: 2px; }
  .row:hover { background: var(--row-bg); }
  .row .text { flex: 1; word-break: break-word; }
  .row .label-text { flex: 0 0 35%; font-weight: 600; }
  .row .body-text { flex: 1; color: var(--muted); }
  .row .del { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 14px; padding: 2px 6px; }
  .row .del:hover { color: var(--danger); }
  .empty { padding: 14px; color: var(--muted); text-align: center; font-style: italic; }
  .add-row { display: flex; gap: 6px; margin-top: 8px; }
  .add-row input { flex: 1; background: var(--row-bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; color: var(--fg); font: inherit; }
  .add-row input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
  .add-row button { background: var(--accent); border: 0; color: #111; border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit; font-weight: 600; }
  .add-row button:disabled { background: var(--border); color: var(--muted); cursor: not-allowed; }
  footer { display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid var(--border); }
  footer button { background: none; border: 1px solid var(--border); color: var(--fg); border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit; }
  footer button.primary { background: var(--accent); color: #111; border-color: var(--accent); font-weight: 600; }
</style>
</head>
<body>

<section>
  <h2>Whip phrases</h2>
  <div class="hint">Random pick on each whip crack.</div>
  <div id="warn-empty" class="warn" style="display:none">Add at least one phrase, or Whip will just press Enter.</div>
  <div id="phrase-list" class="list"></div>
  <div class="add-row">
    <input id="phrase-input" maxlength="200" placeholder="Type a new phrase…">
    <button id="phrase-add" disabled>Add</button>
  </div>
  <div id="phrase-hint" class="hint" style="display:none"></div>
</section>

<section>
  <h2>Quick modes</h2>
  <div class="hint">Each one becomes a Mode-submenu option that types its text and presses Enter.</div>
  <div id="quick-list" class="list"></div>
  <div class="add-row">
    <input id="quick-label" maxlength="80" placeholder="Label (e.g. ship it)">
    <input id="quick-text" maxlength="200" placeholder="Text to type">
    <button id="quick-add" disabled>Add</button>
  </div>
  <div id="quick-hint" class="hint" style="display:none"></div>
</section>

<footer>
  <button id="reset">Reset defaults</button>
  <button id="done" class="primary">Done</button>
</footer>

<script>
  let state = { whipPhrases: [], quickModes: [] };

  const $ = id => document.getElementById(id);

  function slugify(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'mode';
  }
  function uniqueId(label) {
    const base = slugify(label);
    if (!state.quickModes.some(m => m.id === base)) return base;
    let n = 2;
    while (state.quickModes.some(m => m.id === `${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  function renderPhrases() {
    const list = $('phrase-list');
    list.innerHTML = '';
    if (state.whipPhrases.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No phrases yet.';
      list.appendChild(e);
    } else {
      state.whipPhrases.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'row';
        const t = document.createElement('div');
        t.className = 'text';
        t.textContent = p;
        const b = document.createElement('button');
        b.className = 'del';
        b.textContent = '×';
        b.title = 'Remove';
        b.onclick = () => {
          state.whipPhrases.splice(idx, 1);
          save();
        };
        row.appendChild(t);
        row.appendChild(b);
        list.appendChild(row);
      });
    }
    $('warn-empty').style.display = state.whipPhrases.length === 0 ? '' : 'none';
  }

  function renderQuick() {
    const list = $('quick-list');
    list.innerHTML = '';
    if (state.quickModes.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No quick modes yet.';
      list.appendChild(e);
      return;
    }
    state.quickModes.forEach((m, idx) => {
      const row = document.createElement('div');
      row.className = 'row';
      const l = document.createElement('div');
      l.className = 'text label-text';
      l.textContent = m.label;
      const t = document.createElement('div');
      t.className = 'text body-text';
      t.textContent = `→ ${m.text}`;
      const b = document.createElement('button');
      b.className = 'del';
      b.textContent = '×';
      b.title = 'Remove';
      b.onclick = async () => {
        const res = await window.prefs.saveMessages({
          whipPhrases: state.whipPhrases,
          quickModes: state.quickModes.filter((_, i) => i !== idx),
          confirmDeleteId: m.id,
        });
        state = { whipPhrases: res.whipPhrases, quickModes: res.quickModes };
        renderAll();
      };
      row.appendChild(l);
      row.appendChild(t);
      row.appendChild(b);
      list.appendChild(row);
    });
  }

  function renderAll() {
    renderPhrases();
    renderQuick();
    validatePhraseInput();
    validateQuickInput();
  }

  function validatePhraseInput() {
    const v = $('phrase-input').value.trim();
    const hint = $('phrase-hint');
    const btn = $('phrase-add');
    let msg = '';
    if (!v) {
      msg = '';
      btn.disabled = true;
    } else if (v.length > 200) {
      msg = 'Too long (max 200 characters).';
      btn.disabled = true;
    } else if (state.whipPhrases.some(p => p.toLowerCase() === v.toLowerCase())) {
      msg = 'Already in list.';
      btn.disabled = true;
    } else {
      msg = '';
      btn.disabled = false;
    }
    hint.textContent = msg;
    hint.style.display = msg ? '' : 'none';
  }

  function validateQuickInput() {
    const label = $('quick-label').value.trim();
    const text = $('quick-text').value.trim();
    const hint = $('quick-hint');
    const btn = $('quick-add');
    let msg = '';
    if (!label || !text) {
      msg = '';
      btn.disabled = true;
    } else if (label.length > 80 || text.length > 200) {
      msg = 'Too long.';
      btn.disabled = true;
    } else if (state.quickModes.some(m => m.label.toLowerCase() === label.toLowerCase())) {
      msg = 'Label already in list.';
      btn.disabled = true;
    } else {
      msg = '';
      btn.disabled = false;
    }
    hint.textContent = msg;
    hint.style.display = msg ? '' : 'none';
  }

  async function save() {
    const res = await window.prefs.saveMessages({
      whipPhrases: state.whipPhrases,
      quickModes: state.quickModes,
    });
    state = { whipPhrases: res.whipPhrases, quickModes: res.quickModes };
    renderAll();
  }

  $('phrase-input').addEventListener('input', validatePhraseInput);
  $('phrase-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('phrase-add').disabled) $('phrase-add').click();
  });
  $('phrase-add').onclick = () => {
    const v = $('phrase-input').value.trim();
    if (!v) return;
    state.whipPhrases.push(v);
    $('phrase-input').value = '';
    save();
  };

  $('quick-label').addEventListener('input', validateQuickInput);
  $('quick-text').addEventListener('input', validateQuickInput);
  $('quick-text').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('quick-add').disabled) $('quick-add').click();
  });
  $('quick-add').onclick = () => {
    const label = $('quick-label').value.trim();
    const text = $('quick-text').value.trim();
    if (!label || !text) return;
    state.quickModes.push({ id: uniqueId(label), label, text });
    $('quick-label').value = '';
    $('quick-text').value = '';
    save();
  };

  $('reset').onclick = async () => {
    if (!confirm('Reset whip phrases and quick modes to the OpenWhip defaults? Your current entries will be discarded.')) return;
    const res = await window.prefs.resetDefaults();
    state = { whipPhrases: res.whipPhrases, quickModes: res.quickModes };
    renderAll();
  };

  $('done').onclick = () => window.close();

  (async () => {
    const res = await window.prefs.getMessages();
    state = { whipPhrases: res.whipPhrases, quickModes: res.quickModes };
    renderAll();
  })();
</script>

</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add prefs.html
git commit -m "Add prefs.html message editor UI"
```

---

## Task 6: Add IPC handlers in main.js

**Files:**
- Modify: `main.js` (add handlers near the existing `ipcMain.on` block around line 322)

- [ ] **Step 1: Import dialog if not already imported**

Find the top of `main.js`. The first line is:

```js
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
```

Replace it with:

```js
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, dialog } = require('electron');
```

- [ ] **Step 2: Add the three handlers**

Find the existing IPC block (around line 322 — `ipcMain.on('whip-crack', ...)` and `ipcMain.on('hide-overlay', ...)`). Add these three handlers right after `ipcMain.on('hide-overlay', ...)`:

```js
ipcMain.handle('prefs:get', () => {
  return {
    whipPhrases: whipPhrases.slice(),
    quickModes: quickModes.map(m => ({ ...m })),
  };
});

ipcMain.handle('prefs:save', (event, payload) => {
  const incomingPhrases = Array.isArray(payload?.whipPhrases)
    ? payload.whipPhrases
        .filter(x => typeof x === 'string')
        .map(x => x.trim())
        .filter(x => x.length > 0 && x.length <= MAX_MESSAGE_LEN)
    : whipPhrases.slice();
  const incomingQuick = Array.isArray(payload?.quickModes)
    ? payload.quickModes
        .filter(m => m && typeof m.id === 'string' && typeof m.label === 'string' && typeof m.text === 'string')
        .map(m => ({ id: m.id, label: m.label.trim(), text: m.text.trim() }))
        .filter(m => m.label.length > 0 && m.text.length > 0 && m.text.length <= MAX_MESSAGE_LEN)
    : quickModes.map(m => ({ ...m }));

  // If the renderer is asking to delete the currently-active quick mode,
  // confirm before applying so the user doesn't get switched silently.
  const deletingActive =
    payload?.confirmDeleteId === macroMode &&
    !incomingQuick.some(m => m.id === macroMode);
  if (deletingActive) {
    const choice = dialog.showMessageBoxSync(prefsWindow || null, {
      type: 'warning',
      buttons: ['Cancel', 'Remove and switch to Whip'],
      defaultId: 0,
      cancelId: 0,
      message: 'Remove the currently-active quick mode?',
      detail: 'OpenWhip will switch to Whip mode.',
    });
    if (choice === 0) {
      return {
        whipPhrases: whipPhrases.slice(),
        quickModes: quickModes.map(m => ({ ...m })),
      };
    }
  }

  whipPhrases = incomingPhrases;
  quickModes = incomingQuick;
  if (!isValidMode(macroMode)) macroMode = MODES.WHIP;
  saveSettings();
  rebuildTrayMenu();
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('mode-changed');

  return {
    whipPhrases: whipPhrases.slice(),
    quickModes: quickModes.map(m => ({ ...m })),
  };
});

ipcMain.handle('prefs:reset', () => {
  whipPhrases = DEFAULT_MESSAGES.whipPhrases.slice();
  quickModes = DEFAULT_MESSAGES.quickModes.map(m => ({ ...m }));
  if (!isValidMode(macroMode)) macroMode = MODES.WHIP;
  saveSettings();
  rebuildTrayMenu();
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('mode-changed');
  return {
    whipPhrases: whipPhrases.slice(),
    quickModes: quickModes.map(m => ({ ...m })),
  };
});
```

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "Add prefs IPC handlers"
```

---

## Task 7: Implement openPrefsWindow

**Files:**
- Modify: `main.js` (replace the stub from Task 3)

- [ ] **Step 1: Replace the stub with the real window**

Find the stub `function openPrefsWindow()` added in Task 3 step 2. Replace it with:

```js
function openPrefsWindow() {
  if (prefsWindow && !prefsWindow.isDestroyed()) {
    prefsWindow.show();
    prefsWindow.focus();
    return;
  }
  prefsWindow = new BrowserWindow({
    width: 480,
    height: 640,
    title: 'OpenWhip · Messages',
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#1c1c1c',
    webPreferences: {
      preload: path.join(__dirname, 'prefs-preload.js'),
    },
  });
  prefsWindow.setMenuBarVisibility(false);
  prefsWindow.loadFile('prefs.html');
  prefsWindow.on('closed', () => {
    prefsWindow = null;
  });
}
```

- [ ] **Step 2: Verify the window opens and persists edits**

```bash
npm start
```

- Right-click tray → `Messages…`. The Preferences window should open with the seven default phrases and the two default quick modes.
- Add a new phrase by typing in the input and clicking Add. It should appear in the list.
- Delete a phrase by clicking the × next to it. It should disappear.
- Add a new quick mode (label `ship it`, text `ship it`). Click Add.
- Close the prefs window. Right-click tray → Mode. You should see `Type "ship it" + Enter` as a new radio option.
- Select that mode, focus a terminal, spawn the whip, crack it. `ship it` + Enter should appear.
- Quit the app. Relaunch with `npm start`. The new phrase, new quick mode, and selected mode should all persist.

- [ ] **Step 3: Verify Reset Defaults works**

In the prefs window, click `Reset defaults`. Confirm the dialog. The lists should return to the seven default phrases and the two default quick modes. The `ship it` mode you added should be gone.

- [ ] **Step 4: Verify active-mode-delete confirmation**

Set the current mode to `Type "continue" + Enter`. Open Preferences, click × next to the `continue` row. A native dialog should appear: "Remove the currently-active quick mode?". Click Cancel — the row stays. Click × again, click `Remove and switch to Whip` — the row is gone and the tray Mode submenu now shows `Whip` selected.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "Implement Preferences window"
```

---

## Task 8: Update package.json and README

**Files:**
- Modify: `package.json:33-42` (files array)
- Modify: `README.md` (Modes section)

- [ ] **Step 1: Add prefs files to the npm files array**

Open `package.json`. Find the `files` array (around line 33):

```json
"files": [
  "main.js",
  "preload.js",
  "overlay.html",
  "sounds",
  "icon",
  "bin/openwhip.js",
  "bin/badclaude.js",
  "README.md"
],
```

Replace it with:

```json
"files": [
  "main.js",
  "preload.js",
  "prefs-preload.js",
  "overlay.html",
  "prefs.html",
  "sounds",
  "icon",
  "bin/openwhip.js",
  "bin/badclaude.js",
  "README.md"
],
```

- [ ] **Step 2: Update README Modes section**

Open `README.md`. Find the Modes section (starts around line 31). Replace the section with:

```markdown
## Modes

Right-click the tray icon for a Mode submenu, ordered loudest to softest:

- **Whip** — Ctrl+C, phrase, Enter. The original. Interrupts whatever claude is doing.
- **Type "<your label>" + Enter** — types your message and submits. Two are built in (`continue`, `looks good`) and you can add your own.
- **Press Enter only** — just Enter. Nudges past a y/n prompt without typing anything.

Your choice sticks across restarts.

## Manage your messages

Right-click the tray → **Messages…** opens a settings window where you can:

- Edit the **whip phrases** — the pool of strings Whip mode picks from at random.
- Edit the **quick modes** — the typed-message options shown in the Mode submenu. Add as many as you want.

Changes apply immediately. There's a **Reset defaults** button if you want to start over.
```

- [ ] **Step 3: Commit**

```bash
git add package.json README.md
git commit -m "Bundle prefs assets and document message management"
```

---

## Task 9: Repackage and reinstall

**Files:** none

- [ ] **Step 1: Repackage the .app**

```bash
npm run package
```

Expected: `out/OpenWhip-darwin-arm64/OpenWhip.app` exists, and the script log ends with `Ad-hoc signing: …/OpenWhip.app`.

- [ ] **Step 2: Quit any running OpenWhip and install the new build**

```bash
osascript -e 'tell application "OpenWhip" to quit' 2>/dev/null || true
rm -rf /Applications/OpenWhip.app
cp -R out/OpenWhip-darwin-arm64/OpenWhip.app /Applications/
open /Applications/OpenWhip.app
```

- [ ] **Step 3: Verify the packaged build**

Right-click the tray icon. The Mode submenu should look identical to dev mode. Open `Messages…`. The Preferences window should open and behave the same as in `npm start`.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-review notes

- **Spec coverage:** Every spec requirement maps to a task — DEFAULT_MESSAGES + migration (Task 1), MODES collapse + data-driven dispatch (Task 2), data-driven tray menu (Task 3), IPC bridge (Task 4), prefs UI (Task 5), IPC handlers w/ active-delete confirm + reset (Task 6), window lifecycle (Task 7), packaging + README (Tasks 8–9).
- **Placeholder scan:** No `TODO` / `TBD` / "implement later". Every code step shows the actual code.
- **Type consistency:** `whipPhrases` is always `string[]`. `quickModes` is always `{id, label, text}[]`. `macroMode` is a string id matching `MODES.WHIP`, `MODES.ENTER`, or one of `quickModes[].id`. `isValidMode()` is defined once in Task 1 and reused in Tasks 1, 6.
- **Risk note:** Task 5 uses `confirm()` for the Reset dialog (renderer-side) but the active-mode-delete uses `dialog.showMessageBoxSync` in the main process (Task 6). This is intentional: Reset is a pure renderer choice, but the active-delete needs to gate the main-process state change, so the main process is the right place to ask.
