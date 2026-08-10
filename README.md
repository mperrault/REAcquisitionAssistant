# RE Acquisition Assistant

Private real-estate acquisition decision support for ranking, comparing, and documenting residential acquisition opportunities.

Implemented slices:

- Next.js App Router, TypeScript, Tailwind CSS, and shadcn-style UI primitives
- Supabase-ready search profile schema with RLS
- editable Search Profiles UI at `/profiles`
- seeded Quiet Corner Second Home profile
- Supabase-ready property and property-facts schema with RLS
- editable Properties UI at `/properties`
- profile-driven scoring engine with hard rejections, category scores, labels, explanations, and missing-data warnings
- local score evaluation history with Supabase-ready `score_evaluations` migration
- local profile and property persistence for first-run development
- unit tests for profile persistence, property persistence, and scoring behavior

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Open:

- [http://localhost:3000/profiles](http://localhost:3000/profiles)
- [http://localhost:3000/properties](http://localhost:3000/properties)

## Environment

Copy `.env.example` to `.env.local` and add Supabase credentials when a Supabase project is ready:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The current profile and property editors persist to browser local storage so the first MVP workflows are usable before Supabase auth is wired into the app.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Documentation

Read these before expanding the app:

- [Vision](docs/01-Vision.md)
- [PRD](docs/02-PRD.md)
- [Architecture](docs/03-Architecture.md)
- [Database Model](docs/04-Database.md)
- [Scoring Specification](docs/05-Scoring.md)
- [UX Specification](docs/06-UX.md)
- [Roadmap](docs/07-Roadmap.md)
- [API / Integration Plan](docs/08-API.md)
- [Initial Search Profile](docs/09-Initial-Search-Profile.md)

## Current Assumptions

- The Quiet Corner profile is seed data, not scoring logic.
- Supabase migrations define the target persistence model, while local storage backs the first editable UI slice.
- Scoring uses the active profile and stores each run as a separate evaluation so profile-version history can be preserved.
