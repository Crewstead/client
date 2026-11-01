# Crewstead client

What people use to reach a [Crewstead](https://github.com/Crewstead/server) hub:

| Folder | What it is |
| --- | --- |
| `web/` | The Svelte 5 / SvelteKit web app the hub serves |
| `ui/` | Its shared styles and design tokens |
| `daemon/` | The computer service: lets chats work in this computer's projects and use Claude Code here |

Planned here too: the desktop app (Linux, Windows, macOS) with the computer service built in, so it
just runs, and a mobile app. See `docs/plan/28-distribution.md` in the server repository.

## Development

Check out `core`, `client` and `server` side by side, then:

```bash
pnpm install
pnpm check && pnpm lint && pnpm test
```

The web app is developed through the server: `pnpm dev` in `server` runs the hub and this web app
together (http://127.0.0.1:4173). `pnpm build` here builds it for `pnpm start` there.

## Connect a computer (for now)

Until the desktop app exists, a computer joins a hub from a checkout of this repository (Linux):

```bash
pnpm install
pnpm machine connect http://127.0.0.1:4173   # paste the token from the hub's Settings
```

It installs the `crewstead` command and a user service that starts with the computer;
`crewstead help` lists the rest. Project commands run isolated with `bwrap`, which must be installed.
Rules for contributors are in [AGENTS.md](AGENTS.md).
