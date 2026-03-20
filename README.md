# Vantage

**Local-first code review and team evaluation tool for dev leads.**

Scan your local git repos, triage commits in a review queue, track team workload, and run AI-assisted evaluations — all from a single dashboard running on your machine. No cloud accounts required.

[![CI](https://github.com/ThanhWilliamLe/vantage/actions/workflows/ci.yml/badge.svg)](https://github.com/ThanhWilliamLe/vantage/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

---

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm, git

# Clone and install
git clone https://github.com/ThanhWilliamLe/vantage.git
cd vantage
pnpm install

# Start (builds frontend + starts server)
pnpm start

# Open in your browser
# http://127.0.0.1:3847
```

## First-Run Walkthrough

1. **Create a project** — Settings > Projects > give it a name
2. **Add a repository** — Expand the project > add a local git repo path
3. **Add team members** — Settings > Members > add names
4. **Map identities** — Expand a member > map their git email to their profile
5. **Scan** — Review Queue auto-populates with commits from your repos
6. **Review** — Triage commits: review, flag for discussion, or defer

## Features

### Review Queue
Scan local git repos and see all pending commits in one place. Select an item to view the full diff, AI summary, and linked tasks. Review, flag, or defer items individually or in batch.

### Identity Resolution
Map git emails and platform usernames (GitHub, GitLab) to team members. Commits automatically attribute to the right person across all views.

### AI-Powered Analysis
Connect any OpenAI/Anthropic-compatible API, or use a local CLI model (e.g. `claude -p`):
- **Auto-summaries** — plain-language description of what changed and why
- **Categorization** — bugfix, feature, refactor, config, docs, test
- **Risk assessment** — low, medium, high based on change scope and complexity
- **Deep analysis** — file-level findings with severity ratings
- **Daily pre-fill** — AI drafts your daily check-up from git activity
- **Quarterly synthesis** — AI summarizes a quarter into evaluation drafts with trend insights

### GitHub & GitLab Sync
Enrich local commits with PR/MR metadata — status (open, merged, closed, draft), review state, and line counts. Supports GitHub.com and self-hosted GitLab instances.

### Evaluations
- **Daily check-ups** — quick per-member notes with workload scores
- **Quarterly evaluations** — period summaries with AI-generated insights
- **CSV export** — export evaluations for spreadsheets or HR systems

### More
- **Dashboard** — pending count, flagged items, active projects, team members, workload trends
- **Full-text search** — search across commits, AI summaries, review notes, and evaluations
- **Workload view** — commit volume by member and project over configurable date ranges
- **Command palette** — `Ctrl+K` or `/` to search members, projects, and navigate
- **Keyboard shortcuts** — `j/k` to navigate the queue, `r` to review, `f` to flag, `d` to defer

## Configuration

### AI Provider Setup

Go to **Settings > AI Provider** and choose one:

**Option A — API (OpenAI/Anthropic compatible):**
| Field | Example |
|-------|---------|
| Name | My OpenAI |
| Type | API |
| Preset | openai or anthropic |
| Endpoint | `https://api.openai.com/v1` |
| API Key | `sk-...` |
| Model | `gpt-4o` |

**Option B — CLI (zero credentials):**
| Field | Example |
|-------|---------|
| Name | Claude CLI |
| Type | CLI |
| Command | `claude` |
| I/O Method | stdin |

The CLI option works with any tool that reads a prompt from stdin and writes a response to stdout.

### GitHub / GitLab Credentials

Go to **Settings > Credentials** to add platform tokens:
- **GitHub** — personal access token with `repo` scope
- **GitLab** — personal access token with `read_api` scope (add instance URL for self-hosted)

Then add a GitHub/GitLab repository to your project alongside the local repo.

### Access Password

Optional. Go to **Settings > Access Password** to set a password gate. The server runs on `127.0.0.1` only, so this is mainly for shared workstations.

## Data Storage

All data stays on your machine:

| Platform | Location |
|----------|----------|
| Windows  | `%APPDATA%\Vantage\` |
| macOS    | `~/Library/Application Support/vantage/` |
| Linux    | `~/.local/share/vantage/` |

Contains: `vantage.db` (SQLite), `keyfile` (AES-256-GCM encryption key for API tokens), `logs/`.

## Security

- Server binds to `127.0.0.1` only — not accessible from the network
- API tokens encrypted at rest with AES-256-GCM
- Optional access password (bcrypt hashed)
- No telemetry, no cloud services, no data leaves your machine unless you configure an AI provider

## Development

```bash
# Backend only (API on :3847)
pnpm dev

# Frontend dev server (HMR on :5173, proxies API to :3847)
pnpm dev:frontend

# Run all tests (400 backend + 36 frontend unit/integration)
pnpm test

# Run E2E tests (44 Playwright tests across 9 journeys)
pnpm test:e2e

# Type check
pnpm typecheck

# Lint
pnpm lint

# Coverage
pnpm test:coverage
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
      routes/         # Fastify route handlers + integration tests
      plugins/        # Auth middleware
  frontend/     # React SPA (Vite + TanStack Router)
    src/
      routes/         # 10 views (dashboard, reviews, members, etc.)
      components/     # Sidebar, command palette, error banner, login gate
      hooks/          # TanStack Query API hooks
      stores/         # zustand (auth, UI state)
    e2e/              # Playwright E2E tests (9 journeys, 44 tests)
```

## Tech Stack

TypeScript, Fastify, SQLite (better-sqlite3 + Drizzle ORM), React 19, Vite, TanStack Router/Query, Tailwind CSS v4, simple-git, Playwright.

## Authors

Created by **[Thanh Le](https://github.com/ThanhWilliamLe)** and **[Claude](https://claude.ai)** (Anthropic).

## License

[Apache License 2.0](LICENSE)
