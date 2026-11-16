# KUMMIE — Your K-pop Chingu

European K-pop commerce, media and collector platform, launching from Bulgaria.

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Current milestone: [docs/specs/M1-commerce.md](docs/specs/M1-commerce.md) (M0 done: [M0-foundation.md](docs/specs/M0-foundation.md))
- Business concept (leading): [docs/concept/KUMMIE_Platform_Concept_v3.md](docs/concept/KUMMIE_Platform_Concept_v3.md)
- Brand: [docs/brand/README.md](docs/brand/README.md)
- Instructions for Claude Code: [CLAUDE.md](CLAUDE.md)
- **Ръководство за собственика (BG):** [docs/owner-guide.md](docs/owner-guide.md)
- Local setup (Windows, PowerShell): [docs/dev-setup.md](docs/dev-setup.md)

## Quick start

```powershell
corepack enable
pnpm install
Copy-Item apps/api/.env.example apps/api/.env   # then put the postgres password in it
pnpm dev                                         # web :3000 · admin :5173 · api :3001
```

| Path | What |
|---|---|
| `apps/web` | Next.js storefront (BG/EN) |
| `apps/mobile` | Expo app (Android first) |
| `apps/admin` | Admin + Bulgaria hub (Vite + React) |
| `apps/api` | Fastify + PostgreSQL (Drizzle), `tick` cron worker |
| `packages/core` | Money, VAT, shipping, Kummies, badges, order statuses, taxonomy |
| `packages/brand` | Design tokens (CSS + TS), fonts, star and equaliser |
| `packages/i18n` | All user-facing copy, Bulgarian and English |
| `data/seed` | Groups by generation, merch taxonomy |
