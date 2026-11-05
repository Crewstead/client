# Crewstead project instructions

This is a new, independent project. Read `PLAN.md` and the relevant focused specifications before implementation.
Crewstead lives in three repositories, checked out side by side: `core` (shared code, one package
`@crewstead/core`), `client` (the web app, the computer service, later the desktop and mobile apps) and
`server` (the hub). The plan, status and specifications are in `server` (`PLAN.md`, `docs/`); paths
below such as `docs/plan/...` are in that repository.
This file does not appoint an agent lead or authorize additional agents.

- Use Svelte 5 and TypeScript for UI work. Do not introduce React.
- Own the agent runtime/tool loop. Reuse reviewed Codex source where useful; do not launch Codex CLI,
  Codex app-server, or OpenCode as the app engine, including indirect SDK binary wrappers.
- Owner exception (2026-10-30): the machine daemon may run the official, unmodified `claude` program as a
  Personal-only model on the user's own machine, signed in by that user through Anthropic's own flow, with
  Claude Code's tools, MCP servers and session history off. Never on the hub server, never for organisation
  models, and never read, copy or store its sign-in. See `docs/plan/10-backends.md` "Claude Code".
  Owner update (2026-10-30): its owner may also use it in an organisation workspace that allows members'
  personal models; it stays that owner's personal model there and is never offered to other members.
- Use supported direct provider integrations. Existing CLI auth files must stay untouched and are not app credentials.
- Keep optional modules removable through explicit interfaces and lifecycle contracts; read `docs/plan/22-modularity.md`.
- No application-level conversation encryption, custom vault, or recovery-key implementation now.
  Keep HTTPS and OS credential protection. The hub is trusted with readable transcripts.
- Keep Personal and Organisation contexts distinct. Org admins govern org models, not users' personal credentials.
  Owner update (2026-11-05): an org admin may share the org's models with members' Personal chats (an
  org setting, off by default). The org pays within its limits and sees only spending, never those chats.
- Keep authored files focused: target 100–250 lines; hard maximum 400 physical lines and 2,000 words.
  Split by responsibility before the maximum. Do not hide complexity in enormous lines or barrel files.
  Generated artifacts and dependency lockfiles are checked separately and must be labeled generated.
- Read `docs/STATUS.md` before claiming progress. Distinguish the implemented local prototype from the planned production hub.
- Keep client, hub, and machine execution boundaries explicit; server code never shells into arbitrary projects.
  Owner update (2026-10-31): a planned cloud sandbox may run code for cloud chats only inside a disposable,
  isolated container on the hub server, never in a project or on the host; and a "whole computer" chat may
  act on its owner's PC with the owner's own access, with approvals. See `docs/plan/25-places.md`.
- Keep the old `dev-workflow` disabled. Do not reinstall hooks or use it to implement this project.
- Do not import existing standalone Codex chats or Happier data automatically.
- Do not create Git branches, commits, pushes, PRs, worktrees, or Git metadata without a separate user request.
  DeepSeek/OpenCode must not run Git or project-management commands at all.
- Preserve existing provider authentication. No subscription-to-API fallback without explicit owner approval.
- Never put real credentials, recovery material, provider outputs containing secrets, or production data in this tree.
- Mock billable and destructive external actions during development. Small live provider checks need explicit bounds.
- A change is verified by executed evidence, not by a successful model exit or a test plan alone.
- Browser tests must use separate ports and disposable data; never replace the user's running preview.
- Update requirements, adapter capabilities, and operational instructions with material architecture changes.
- Respect project scope; changes to the existing hub, DNS, server, or global settings require their own task scope.
