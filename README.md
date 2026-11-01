# Crewstead client

What people use to reach a [Crewstead](https://github.com/Crewstead/server) hub:

| Folder    | What it is                                                                                 |
| --------- | ------------------------------------------------------------------------------------------ |
| `web/`    | The Svelte 5 / SvelteKit web app the hub serves                                            |
| `ui/`     | Its shared styles and design tokens                                                        |
| `daemon/` | The computer service: lets chats work in this computer's projects and use Claude Code here |

| `desktop/` | The desktop app (Electron): the hub's web app in a window, with the computer service built in |

Planned here too: a mobile app. See `docs/plan/28-distribution.md` in the server repository.

## The desktop app

Each release has installers: `Crewstead-<version>-linux-x86_64.AppImage` (one portable file),
`Crewstead-<version>-win-x64.exe` (installs for you, no admin rights) and `.dmg` files for Macs
(Apple silicon and Intel). They are not signed yet: Windows warns once (More info → Run anyway),
macOS asks you to open it with right-click → Open.

On first start it asks for your hub's address, then you sign in. It then asks once whether chats may
use this computer; yes registers it with the hub as you and runs the computer service in the
background, nothing to copy or install. Closing the window keeps it in the tray, and it starts with the
computer (the tray menu turns that off, allows folders for projects and switches whole-computer chats).
Project commands need bubblewrap, so on Windows and macOS chats use Claude Code there but run no
project commands yet. It does not update itself yet: install a newer release over it.

```bash
pnpm --filter @crewstead/desktop start   # run it from this checkout
pnpm --filter @crewstead/desktop dist    # build this system's installer into desktop/dist
```

## Development

Check out `core`, `client` and `server` side by side, then:

```bash
pnpm install
pnpm check && pnpm lint && pnpm test
```

The web app is developed through the server: `pnpm dev` in `server` runs the hub and this web app
together (http://127.0.0.1:4173). `pnpm build` here builds it for `pnpm start` there.

## Connect a computer without the app

A computer without a screen (a server, a build machine) joins a hub from a checkout of this repository
(Linux):

```bash
pnpm install
pnpm machine connect http://127.0.0.1:4173   # paste the token from the hub's Settings
```

It installs the `crewstead` command and a user service that starts with the computer;
`crewstead help` lists the rest. Project commands run isolated with `bwrap`, which must be installed.
Rules for contributors are in [AGENTS.md](AGENTS.md).
