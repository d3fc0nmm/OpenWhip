# OpenWhip

![Whip divider](assets/divider.png)

Sometimes claude code is going too shlow, and you must whip him into shape..

## Install + run

```bash
npm install -g openwhip
openwhip
```

windows and mac supported out of the box, but Linux is a special snowflake so you need to install `xdotool` for keyboard automation

```bash
sudo apt install xdotool
```

## Controls

- Click tray icon: spawn whip.
- Click: drop whip.
- Whip him 😩💢
- It sends an interrupt (Ctrl-C) and one of 5 encouraging messages!

For safety, OpenWhip only sends keystrokes when a known terminal or editor is focused (Terminal, iTerm, Ghostty, Alacritty, WezTerm, kitty, Warp, Hyper, VS Code, Cursor, Zed, and friends). If yours isn't on the list, open an issue.

## Modes

Right-click the tray icon for a Mode submenu:

- **Whip** — Ctrl+C, phrase, Enter. The original.
- **Press Enter only** — just Enter. Nudge claude past a y/n prompt without interrupting him.

Your choice sticks across restarts.

## macOS permissions

Sending keystrokes to a terminal needs macOS's blessing:

- **iTerm2** — OpenWhip drives it through iTerm2's own AppleScript API, so you only see a one-time *"OpenWhip wants to control iTerm2"* modal. Click Allow and you're done. No Accessibility toggle, no fighting with System Settings.
- **Other terminals** (Terminal.app, Ghostty, WezTerm, etc.) — falls back to a System Events keystroke, which means OpenWhip needs to be in **System Settings → Privacy & Security → Accessibility** with its toggle on.

If you hear the whip crack but no keystrokes show up in your terminal, you've probably hit macOS's silent-drop bug for unsigned bundles — TCC keeps the Accessibility toggle "on" in the UI but rejects the keystrokes at runtime. Easiest fixes: switch to iTerm2 (uses the AppleScript path above) or run OpenWhip from source via `npm start`.

## macOS .app (optional)

If you'd rather run OpenWhip as a proper menu-bar app (no Dock icon, no terminal window hanging around):

```bash
npm install
npm run package
open "out/OpenWhip-darwin-arm64/OpenWhip.app"
```

Override the arch with `OPENWHIP_ARCH=x64 npm run package` for Intel Macs. The packaged build is ad-hoc codesigned (`scripts/package-app.js`) so its identity stays stable across launches.

## Roadmap

- [x] Initial release! 🥳
- [x] Cease and desist letter from Anthropic
- [ ] Crypto miner
- [ ] Logs of how many times you whipped claude so when the robots come we can order people nicely for them
- [ ] Updated whip physics