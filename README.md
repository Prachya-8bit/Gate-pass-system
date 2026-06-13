# SYS Gate Pass

Factory gate pass and man-day tracking system for a Thai industrial site. Contractors register workers on arrival; an admin dashboard tracks man-days per company and accident history. The UI is in Thai.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite via Prisma |
| Auth | bcrypt password hash + HTTP-only JWT cookie (`jose`) |
| Styling | Inline styles (design tokens in `components/atoms.tsx`) |
| Export | `xlsx` (client-side) |

## Getting started

Requires Node.js 20+.

```bash
npm install
cp .env.local.example .env.local      # then edit JWT_SECRET
npx prisma migrate dev --name init     # create the SQLite schema
npx prisma db seed                     # load demo admin + sample records
npm run dev                            # http://localhost:3009
```

Default admin login — credential `admin`, password `admin123`.

> Run `npm install` separately on each OS you develop on (WSL2 / Windows). The
> Next.js SWC and Prisma engine binaries are platform-specific, so a single
> `node_modules` cannot be shared across the WSL2/Windows boundary.

## Scripts

```bash
npm run dev      # dev server on port 3009
npm run build    # production build
npm run start    # serve the production build on port 3009
npm run lint     # eslint
npx prisma studio    # browse the database
npx tsc --noEmit     # type-check
```

## Project layout

```
app/             App Router pages + API routes (auth, records, users)
components/      atoms.tsx (design tokens) + LoginScreen / ContractorFlow / AdminFlow
lib/             db.ts (Prisma client), auth.ts (JWT session), constants.ts
prisma/          schema.prisma, migrations, seed.ts
middleware.ts    protects /contractor and /admin routes by role
UI/              original design prototypes (visual spec — not production code)
```

## Auth model

No self-registration. The admin creates contractor accounts from the dashboard.
Login validates a bcrypt hash and sets a 7-day `gp_token` HTTP-only JWT cookie;
`middleware.ts` redirects unauthenticated users to `/login` and blocks the wrong role.

## Deployment

Production runs in Docker (Next.js standalone on `node:20-alpine`) behind a Caddy
reverse proxy with automatic Let's Encrypt HTTPS.

```powershell
cp .env.production.example .env.production   # set JWT_SECRET + DATABASE_URL
mkdir data                                   # SQLite volume bind mount
.\deploy.ps1                                 # build, migrate, restart
```

Before the first deploy: set your real domain in `Caddyfile`, point its A record at
the server, open TCP 80 + 443, and generate a 64-char `JWT_SECRET`. Back up
`./data/gatepass.db` on a schedule. Never commit `.env.production`.
