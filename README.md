# Vantage

Local-first code review and team evaluation tool for dev leads. Reads from local git repos, enriches with GitHub/GitLab PR metadata, and provides AI-assisted summaries — all running on your machine with no cloud dependency.

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm, git

# Install dependencies
pnpm install

# Start (builds frontend + starts server)
pnpm start

# Open http://127.0.0.1:3847
```

Then: **Create a project** > **Add a local repo path** > **Add a member** > **Map their email** > **Scan** > review.

## What It Does

- **Review Queue** — Scan local git repos, see all pending commits in one place. Review, flag, or defer items. Batch actions for speed.
- **Identity Resolution** — Map git emails and platform usernames to team members. Commits auto-attribute to the right person.
- **AI Summaries** — Connect any OpenAI/Anthropic-compatible API (or a local CLI model) to auto-generate commit summaries, categories, risk levels, and deep analysis.
- **Daily Check-Ups** — Quick daily evaluation per team member with optional AI pre-fill from that day's git activity.
- **Quarterly Evaluations** — AI synthesizes a quarter's worth of daily check-ups into evaluation drafts with trend insights.
- **GitHub/GitLab Sync** — Enrich local commits with PR/MR metadata (status, draft, reviews). Supports self-hosted GitLab.
- **Full-Text Search** — Search across commit messages, AI summaries, review notes, and evaluations.
- **Workload Visibility** — Commit volume by member and project over configurable time periods.
- **CSV Export** — Export evaluations for use in spreadsheets or HR systems.

## Development

```bash
# Backend only (API on :3847)
pnpm dev

# Frontend dev server (HMR on :5173, proxies API to :3847)
pnpm dev:frontend

# Run all tests (380 backend + 36 frontend)
pnpm test

# Type check
pnpm typecheck
```

## Project Structure

```
packages/
  shared/       # TypeScript types, constants, status transitions
  backend/      # Fastify API server + SQLite database
    src/
      data/           # Drizzle ORM schema, migrations, test helpers
      crypto/         # AES-256-GCM encryption, bcrypt, keyfile management
      errors/         # Typed error hierarchy (7 classes)
      services/       # Business logic (project, member, scan, review, AI, etc.)
      integrations/   # Git CLI, GitHub API, GitLab API, AI providers
      routes/         # Fastify route handlers
      plugins/        # Auth middleware
  frontend/     # React SPA (Vite + TanStack Router)
    src/
      routes/         # 10 views (dashboard, reviews, members, etc.)
      components/     # Sidebar, command palette, error banner, login gate
      hooks/          # TanStack Query API hooks
      stores/         # zustand (auth, UI state)
```

## Data Storage

All data stays on your machine:

| Platform | Location |
|----------|----------|
| Windows  | `%APPDATA%\Vantage\` |
| macOS    | `~/Library/Application Support/vantage/` |
| Linux    | `~/.local/share/vantage/` |

Contains: `vantage.db` (SQLite), `keyfile` (encryption key for API tokens), `logs/`.

## Security

- Server binds to `127.0.0.1` only — not accessible from the network
- API tokens and keys encrypted at rest with AES-256-GCM
- Optional access password (bcrypt) as a login gate
- No telemetry, no cloud services, no data leaves your machine unless you configure an AI provider

## Tech Stack

TypeScript, Fastify, SQLite (better-sqlite3 + Drizzle ORM), React 19, Vite, TanStack Router/Query, Tailwind CSS v4, simple-git.

## License

MIT
