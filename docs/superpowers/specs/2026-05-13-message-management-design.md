# Message Management — Design

**Status:** Approved (brainstorming)
**Date:** 2026-05-13
**Owner:** miguel.martinez@tec-refresh.com

## Problem

Today OpenWhip ships with a fixed pool of seven Whip-mode phrases hardcoded in `main.js:350-358` and two quick modes (`continue`, `looks good`) implemented as bespoke `MODES` enum entries. Adding, removing, or tweaking a message requires editing source and rebuilding. We want users to manage these themselves.

## Goal

A dedicated Preferences window lets the user edit:

1. The pool of phrases Whip mode types after Ctrl+C (random pick on crack).
2. The list of quick modes (each = a label shown in the tray Mode submenu + the text typed when active, followed by Enter).

Changes apply live — no app restart, no JSON editing.

## Non-goals

- Reordering messages via drag-and-drop.
- Per-phrase weighting for the random Whip pick.
- Import / export of message sets.
- Global keyboard shortcut to open Preferences.
- Multi-instance Preferences editing (single-instance window prevents it).

## UI

A `BrowserWindow` opened from a new tray menu item `Messages…`. Standard window chrome (it is a settings window, not the click-through overlay); 480×640; single-instance (focus if already open). `LSUIElement: true` continues to keep OpenWhip out of the Dock.

The window has two sections, top-to-bottom:

1. **Whip phrases** — a list of strings. Each row shows the phrase and a delete (×) button. Below the list: a text input plus an Add button. When the list is empty, an inline warning reads *"Add at least one phrase, or Whip will just press Enter."*
2. **Quick modes** — a list of `{ label, text }` entries. Each row shows the label and a delete (×) button. Below the list: two inputs (label, text) plus an Add button.

Footer: `Reset defaults` and `Done`. `Reset defaults` opens a confirmation dialog before replacing both lists with bundled defaults; it does NOT change the currently-selected `mode`.

## Architecture

### IPC surface

The Preferences renderer talks to main through a new `prefs-preload.js` exposing a `window.prefs` bridge:

| Method | Direction | Purpose |
|---|---|---|
| `getMessages()` | renderer → main → renderer | Returns `{ whipPhrases, quickModes }` from settings. |
| `saveMessages({ whipPhrases, quickModes })` | renderer → main | Persists, rebuilds tray menu, notifies overlay. |
| `resetDefaults()` | renderer → main → renderer | Replaces both lists with bundled defaults, returns the new state. |

Main is the single source of truth. The renderer reads on open and writes on every Add / Edit / Delete — no file watcher, no shared state.

### Data model

Extend the existing `settings.json` in `app.getPath('userData')`. No new file.

```json
{
  "mode": "whip",
  "whipPhrases": ["FASTER", "GO FASTER", "Faster CLANKER", "Speed it up clanker"],
  "quickModes": [
    { "id": "continue",   "label": "continue",   "text": "continue"   },
    { "id": "looks_good", "label": "looks good", "text": "looks good" }
  ]
}
```

- `id` is the stable key used by `macroMode`. For migrated entries it is the existing MODES value (`continue`, `looks_good`) so saved `mode` selections keep resolving.
- For user-created entries `id` is generated server-side from the label (slugified) plus a short random suffix for collision safety.
- `label` is what shows in the tray Mode submenu and the Preferences list.
- `text` is what gets typed (followed by Enter).

### Mode dispatch collapse

`MODES` keeps `WHIP` and `ENTER` as built-ins. `CONTINUE` and `LOOKS_GOOD` are removed from the enum and become regular entries in `quickModes`.

`sendMacro(frontmost)`:

- `mode === WHIP` → random pick from `whipPhrases`; if the array is empty, fall through to the Enter-only path.
- `mode === ENTER` → Enter-only path.
- Anything else → look up `quickModes.find(m => m.id === mode)`. If found, `sendTypeText(entry.text, frontmost)`. If not found (deleted while selected), fall back to `WHIP` and persist the change.

### Tray menu becomes data-driven

`rebuildTrayMenu()` builds the Mode submenu from `[ WHIP, ...quickModes, ENTER ]`. Adding or renaming a quick mode in Preferences calls `saveMessages`, which calls `rebuildTrayMenu()` so the change appears immediately. The existing `setMode(mode)` helper continues to do the right thing because all it needs is a string id that matches either `WHIP`, `ENTER`, or one of the `quickModes[].id`s.

### Migration

`loadSettings()`:

- If `whipPhrases` is missing or not an array → seed from the current hardcoded list.
- If `quickModes` is missing or not an array → seed with the two built-ins (`continue`, `looks_good`) using their existing IDs.
- If a previously-saved `mode` no longer resolves to any known id (e.g., the user deleted that quick mode in a future session) → reset to `WHIP` and save.

Bundled defaults live in a single `DEFAULT_MESSAGES` constant in `main.js` and are what `resetDefaults()` writes back.

## Edge cases & validation

| Case | Behavior |
|---|---|
| Empty `whipPhrases` and `mode === WHIP` | `sendMacro` falls through to Enter-only path. Preferences shows the inline warning. |
| Add: empty input or whitespace only | Add button disabled. |
| Add: duplicate of an existing label (case-insensitive) | Add button disabled with hint "Already in list." |
| Add: label longer than 200 chars | Add button disabled with hint "Too long." Same cap for whip phrases and quick-mode `text`. |
| Delete the currently-active quick mode | Confirmation dialog "This is your current mode — remove and switch to Whip?" Yes → delete + setMode(WHIP). No → cancel. |
| Reset defaults | Confirmation dialog. Replaces both lists. Does not change `mode`. If current `mode` is no longer present, falls back to `WHIP`. |
| Corrupt `settings.json` on launch | Existing fallback still works — invalid JSON → defaults used silently, app boots fine. |
| User opens `Messages…` while window already exists | Focus existing window; do not create a second. |

## Files touched

- `main.js` — `MODES` collapse, `DEFAULT_MESSAGES` constant, schema migration in `loadSettings`, new IPC handlers (`prefs:get`, `prefs:save`, `prefs:reset`), new `openPrefsWindow()`, `rebuildTrayMenu()` becomes data-driven, `sendMacro()` looks up quick-mode entry by id.
- `prefs.html` — new file. Two-section editor described above.
- `prefs-preload.js` — new file. Exposes `window.prefs` with `getMessages` / `saveMessages` / `resetDefaults`.
- `package.json` — add `prefs.html` and `prefs-preload.js` to the package (no new dependencies).
- `README.md` — short "Messages" section under Modes.

## Risks

- **macOS Accessibility prompt drift.** The new window is a regular `BrowserWindow`, not the click-through overlay, so it shouldn't trigger the silent-deny TCC path. Confirm in packaged build.
- **Tray menu rebuild churn.** Every quick-mode edit rebuilds the entire tray menu; with menus of <20 entries this is fine, but if we ever add many more entries we should batch.

## Open questions

None at design time.
