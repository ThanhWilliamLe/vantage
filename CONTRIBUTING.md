# Contributing to Vantage

Contributions welcome! Please open an issue first to discuss what you'd like to change.

## Development Setup

**Requirements:** [Node.js 20+](https://nodejs.org/), [pnpm](https://pnpm.io/installation), git

```bash
git clone https://github.com/ThanhWilliamLe/vantage.git
cd vantage
pnpm install
```

### Running locally (two terminals)

```bash
pnpm dev              # Backend (watch mode)
pnpm dev:frontend     # Frontend (Vite dev server with HMR)
```

Or use the stable backend (recommended on Windows):

```bash
pnpm --filter @twle/vantage-backend dev:stable
```

### Testing

```bash
pnpm test             # All tests (unit + integration)
pnpm test:e2e         # Playwright E2E tests
```

### Code quality

```bash
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
```

## Pull Request Guidelines

1. **Open an issue first** to discuss the change
2. Fork the repo and create a feature branch from `main`
3. Write tests for new functionality
4. Ensure `pnpm test`, `pnpm typecheck`, and `pnpm lint` all pass
5. Keep PRs focused — one feature or fix per PR
6. Write a clear description of what changed and why

## Project Structure

```
packages/
  backend/    # Fastify server, Drizzle ORM, SQLite
  frontend/   # React 19, TanStack Router + Query, Tailwind CSS
  shared/     # Shared types and utilities
```

## License

By contributing, you agree that your contributions will be licensed under [Apache 2.0](LICENSE).
