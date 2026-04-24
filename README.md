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

## macOS .app (optional)

If you'd rather run OpenWhip as a proper menu-bar app (no Dock icon, no terminal window hanging around):

```bash
npm install
npm run package
open "out/OpenWhip-darwin-arm64/OpenWhip.app"
```

Override the arch with `OPENWHIP_ARCH=x64 npm run package` for Intel Macs.

## Roadmap

- [x] Initial release! 🥳
- [x] Cease and desist letter from Anthropic
- [ ] Crypto miner
- [ ] Logs of how many times you whipped claude so when the robots come we can order people nicely for them
- [ ] Updated whip physics