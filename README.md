# Harness Mods

A local web app for exploring ways to modify an AI agent harness: a searchable
mods catalog, article reading list, harness map, and versioned configuration
snapshots. Built with Astro, better-auth, and SQLite.

Each clone is an independent installation. Accounts, catalog changes, uploads,
and new snapshots stay on that machine. The catalog and harness history are
shared within the installation, not owned by individual accounts. Every
registered user can manage them.

## Run locally

Requires Node.js **22.12 or newer** and npm.

```sh
git clone https://github.com/elvisrepo/harn.git
cd harn
npm ci
```

Create your own `.env` with a random authentication signing secret. This command
writes it directly to the file without displaying it and refuses to overwrite
an existing `.env`:

```sh
node -e 'require("node:fs").writeFileSync(".env", ["AUTH_SECRET", require("node:crypto").randomBytes(32).toString("hex")].join("=") + "\n", { flag: "wx" })'
```

You do not need the original installation's `.env`, account, or credentials.
Keep your `.env` private; it is gitignored.

```sh
npm run db:setup
npm run dev
```

Open **http://127.0.0.1:4321**. Select **Sign in → Create an account**, or visit
[/register](http://127.0.0.1:4321/register), and choose your own name, email, and
password. Registration stores the account in your local SQLite database.
The catalog and harness map are readable without signing in; editing requires
a session.

### What setup creates

`db:setup` creates the database tables and runs the seed script, which:

- Populates the curated mods catalog from `scripts/seed.ts`.
- Captures an initial harness snapshot from your machine, if no snapshots exist.
- Optionally creates a bootstrap account when `ADMIN_PASSWORD` is set.

Without `ADMIN_PASSWORD`, setup reports that account creation was skipped and
continues. You can register through the app instead.

Snapshots read your local `~/.pi/agent/` configuration and user skills, plus this
project's `.pi/skills/`. Missing configuration is recorded as unknown or absent.
Provider credential contents are not read; only credential-file presence is
recorded. The repository's exported snapshot history is imported separately;
see [snapshot and import procedures](docs/Harness%20how-tos.md).

Re-running the seed updates catalog entries from the seed source and can replace
UI edits. Mirror catalog edits into `scripts/seed.ts` if you want them to survive
re-seeding.

### Environment options

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Your installation's authentication signing key; generate it during setup. |
| `AUTH_URL` | Authentication base URL and trusted origin; defaults to `http://127.0.0.1:4321`. Set it if you use another address or port. |
| `DATABASE_PATH` | SQLite location; defaults to `data/app.db`. |
| `ADMIN_EMAIL` | Optional bootstrap account email; defaults to `admin@harness.local`. |
| `ADMIN_PASSWORD` | Optional bootstrap account password; when unset, account creation is skipped. |

To bootstrap an account instead of registering, add your chosen credentials to
`.env` before running setup:

```dotenv
ADMIN_EMAIL=<your-email>
ADMIN_PASSWORD=<your-chosen-password>
```

The seed creates an account named **Admin** using those values. It does not
generate credentials or write them into `.env`. This account has the same
editing permissions as accounts created through registration. Re-seeding does
not change an existing account's password.

## Commands and documentation

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local development server. |
| `npm run db:setup` | Initialize tables and seed the installation. |
| `npm run build` | Build the app. |
| `npm run preview` | Preview the built app locally. |
| `npm run versions:export` | Export local snapshot history without account data. |
| `npm run versions:import` | Import exported history, skipping existing version numbers by default. |
| `npm run check` | Run build, typecheck, lint, security and dependency checks, HTTP/unit tests, and browser flows. |

The full check also needs Semgrep and Chrome; authenticated flows need
`ADMIN_EMAIL` and `ADMIN_PASSWORD` exported into the process environment.
See [check prerequisites and procedures](docs/Harness%20how-tos.md).

See [architecture.md](architecture.md) for routes and data flows, and
[docs/direction.md](docs/direction.md) for the local-only scope and working agreements.
