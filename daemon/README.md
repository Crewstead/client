# Machine daemon responsibilities

A per-user OS service connects outward to the hub, checks authenticated commands and workspace grants, supervises
our agent-runtime workers, handles local tools, normalizes events, and durably spools unsent results.

The daemon runs independently from the Svelte/Electron client. One OS user's daemon must not be shared as an
execution identity between unrelated hub users. Root/system-wide execution is not a default.

Implemented so far: a daemon that links to the hub, runs Claude Code for its owner's Personal chats
(`src/claude.ts`, adapter in `packages/adapter-claude-code`), and runs project tools in folders its owner
registered here (`src/projects.ts`, `src/folders.ts`, `src/tools/`). On Linux it installs itself as the
`crewstead` command (`~/.local/bin`) and a systemd user service (`src/service.ts`). Spooling and our
runtime workers are still planned.

```
npm run machine -- connect <hub address>   # first time, in this folder: asks for the token, then
                                           # installs the crewstead command, background service and
                                           # its headless browser; nothing else to install
crewstead status                           # hub, service, projects, allowed folders
crewstead allow ~/Projects                 # let the hub add projects inside this folder
crewstead add <folder> [name]              # add a project here
crewstead remove <name>
crewstead computer on | off                # whole-computer chats (they act as you; changes ask first)
crewstead computer commands|browser on|off # narrow them; the hub can narrow or turn off, never on
crewstead install-browser                  # download the headless browser again (install does it once)
crewstead logs | restart | uninstall
crewstead run                              # run in a terminal instead of the background
```

In project chats, commands run only inside bubblewrap (`bwrap`); see `src/tools/command.ts` for exactly what is
visible and writable. Whole-computer chats (`src/tools/computer.ts`) run approved commands as you, in
bash, in their own work folder; unapproved ones run only in that sandbox. Private places (keys, sign-ins,
browser profiles, the hub's data) are opened only with your own approval of that call. The browser tools drive a headless Chromium (its own sandbox, a fresh profile per
chat, no downloads; only localhost unless the project allows network) and can take screenshots, which the
hub keeps in the chat; see `packages/browser/`. See [machine runtime](../docs/plan/09-daemon.md),
[provider adapters](../docs/plan/10-backends.md), and [permissions](../docs/plan/05-identity.md).
