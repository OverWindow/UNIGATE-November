# Project Overview

Unigate is a web service for university transfer admissions and Korean language education.

## Technology Stack and Current Status

- Frontend: Next.js App Router with React, TypeScript, and Tailwind CSS v4. The homepage is ported from jaeminahn/unigate and supports Indonesian (default), Korean, and English. It exports static files to `frontend/out/`.
- Frontend tooling: TypeScript and Oxlint, configured in `frontend/tsconfig.json` and `frontend/.oxlintrc.json`; Tailwind uses `frontend/postcss.config.js`.
- Runtime and package management: Node.js 24 and npm, as documented in the root README. Keep `frontend/package-lock.json` under version control and use `npm ci` for reproducible installs. Refer to `frontend/package.json` and the lockfile for dependency versions.
- Backend: Python 3.13 and Django 5.2, with SQLite at `backend/data/db.sqlite3`. Dependencies are pinned in `backend/requirements.txt`; use `backend/.venv/`. Only the surveys app is installed; admin, authentication, content types, and sessions are not installed. The SurveyResponse model stores responses in survey_responses. The transfer-information modal saves to this table through `POST /api/survey-responses/`; `GET /api/csrf/` issues a CSRF token. No PDF generation, email delivery, or background worker is implemented. `backend/init_db.py` idempotently creates only `django_migrations` (SQLite may also create its internal `sqlite_sequence` table).
- Backend configuration: `python-dotenv` loads only `backend/.env.development` or `backend/.env.production`, selected by the process-level `DJANGO_ENV` (default: development). Existing process variables take precedence; variable interpolation is disabled and UTF-8 BOM is supported. Set `DJANGO_ENV` outside the files. Plain `.env` and example files are not loaded, and there is no fallback to another environment file. Files are optional when process variables provide the required settings. `DJANGO_SECRET_KEY` is required; production disables debug and requires explicit `DJANGO_ALLOWED_HOSTS` without wildcards. Both environments retain `backend/data/db.sqlite3`. Commit only `.env.development.example` and `.env.production.example` with empty secrets; `.env.example` is a legacy pointer. Test configuration loading with `.venv/Scripts/python.exe -m unittest config.test_settings`, which uses synthetic values without reading real environment files. Combined and standalone backend Docker images are available; Cloudtype deployment is not yet configured in an account. HTTPS terminates at the platform. Pre-migration backups are implemented; scheduled/offsite backups are not.
- Frontend Docker: `frontend/Dockerfile` builds with Node.js 24 and serves static files through unprivileged Nginx on HTTP 8080. `nginx.conf` handles static routes, legacy anchor redirects, 404 responses, and caching; `.dockerignore` excludes local artifacts and environment files. The `/api/` proxy uses `BACKEND_ORIGIN` (Docker default: `http://host.docker.internal:8000`). Configure the reachable backend and public host/origin for deployment; HTTPS termination remains deployment-specific.
- The repository contains one frontend (`frontend/`) and one minimal Django backend (`backend/`), managed in one Git repository at the project root.

## Project Structure

```text
unigate-main/
|-- AGENTS.md                 # Project context and agent working guidelines
|-- DESIGN.md                 # Homepage-based visual guidelines and official logo reference
|-- README.md                 # Project overview and local development instructions
|-- .gitignore                # Excludes dependencies, builds, secrets, and Python artifacts
|-- backend/                  # Django config/, surveys/, migration/, manage.py, export-surveys.cmd, init_db.py, requirements.txt, data/
`-- frontend/
    |-- Dockerfile            # Production static server image
    |-- nginx.conf            # Static routing and asset caching
    |-- .dockerignore         # Docker build exclusions
    |-- package.json          # Frontend dependencies and npm scripts
    |-- package-lock.json     # Dependency lockfile
    |-- next.config.js        # Next.js static export configuration
    |-- postcss.config.js     # Tailwind CSS PostCSS plugin
    |-- tsconfig.json         # Strict TypeScript configuration
    |-- .oxlintrc.json        # Oxlint configuration
    |-- public/               # Static assets served directly
    `-- src/
        |-- app/              # Root layout, providers, and homepage
        |-- components/       # Homepage sections and shared UI
        |-- hooks/            # Scroll reveal behavior
        |-- lib/i18n/         # Typed translations and language state
        |-- styles/           # Tailwind theme and global CSS
        `-- types/            # Shared TypeScript types
```

`frontend/node_modules/`, `frontend/.next/`, and `frontend/out/` are generated directories excluded from Git.

## Development and Verification Commands

Run the following commands from `frontend/`:

- `npm ci`: Install dependencies from the lockfile.
- `npm run dev`: Start Next.js at http://localhost:3000.
- `npm run build`: Build the frontend into `frontend/out/`.
- `npm run lint`: Run Oxlint.
- `npm run typecheck`: Run strict TypeScript checks.
- `npm run preview`: Preview the static export locally on port 3000 (run build first).

The consultation form retains `POST https://formspree.io/f/meelzwyb`; no local API or database table is used. Do not submit test messages to the live endpoint. Original policy pages and several social destinations are absent upstream and remain unimplemented. There is currently no frontend test script. From `backend/`, install with `.venv/Scripts/python.exe -m pip install -r requirements.txt`. Set the process environment as documented in README, then run `.venv/Scripts/python.exe manage.py check` and `.venv/Scripts/python.exe -m pip check`. Run `.venv/Scripts/python.exe manage.py migrate` to prepare the database, and `.venv/Scripts/python.exe manage.py test surveys` to test the model on a separate test database. Model changes use the standard `makemigrations` and `migrate` commands. Project app migrations live under `backend/migration/<app>/`, configured through `MIGRATION_MODULES`; survey migrations use `migration.surveys`. The legacy `init_db.py` helper only prepares migration history and does not apply application migrations. The approved survey schema contains id, email (duplicates allowed), age (0–120), education_type (including high_school_graduate), optional desired_university, and created_at. Ordinary model saves validate and trim input; bulk operations bypass model validation and normalization, so callers must validate them separately. Database constraints enforce the age range, education choices, and nonempty trimmed text. The existing Formspree consultation form is not connected to this table; the new transfer-information modal is. The API accepts JSON with the existing fields, enforces an integer age and model choices, and limits optional university input to 500 characters. It returns 201 only after saving. Duplicate emails remain allowed. Update this document when backend setup or project structure changes, and distinguish planned components from implemented ones. Never print environment file values or commit secrets.

## Working Guidelines

Local SQLite CLI: SQLite 3.54.1 is installed at `backend/.venv/Scripts/sqlite3.exe` from the official Windows x64 tools with its SHA3-256 checksum verified. Activate the virtual environment before `manage.py dbshell`; use `manage.py dbshell -- -readonly` for inspection. The executable is Git-ignored, separate from Python's SQLite module, and must be reinstalled on other machines or after recreating the virtual environment. No system PATH change is required.

- For every task request, first explain how the work will proceed. Before making changes, describe the proposed steps, affected files or systems, expected API or database changes, and relevant verification, then ask for the user's explicit approval and wait for their response. An initial request to perform a task is not approval of a plan that has not yet been presented, unless the user explicitly waives this approval step.
- Read-only inspection may be used to prepare a concrete plan, but do not edit files, install dependencies, or change database or service state before approval. Once the user approves the plan, proceed within that scope without asking again for each individual step. If a material change in scope becomes necessary, explain it and obtain approval before making the additional changes.
- Write and maintain `AGENTS.md` and `DESIGN.md` exclusively in English. This requirement applies to these documents, not to user-facing interface languages or source-code comments.
- Before making any frontend design changes, always read and follow `DESIGN.md`. If the file is missing or its guidance is unclear, ask the user for clarification before proceeding with the design changes.
- If instructions or prompts are unclear or open to multiple interpretations, always ask the user for clarification instead of making assumptions. Wait for the user's response before proceeding with work that depends on that clarification.
- After every modification, tell the user whether any APIs or database tables were added. For each new API, provide its HTTP method, path, and purpose. For each new table, provide its name and purpose. If none were added, briefly state that explicitly.
- Avoid creating unnecessary database tables. First evaluate whether existing tables and relationships can meet the requirements. Add only the minimum number of new tables needed for a clear purpose.
- Before implementing or configuring a new worker (a process or service that runs background jobs), explain why it is needed and what it will do, and always ask the user for approval.
- Keep changes within the requested scope. Do not perform unrelated refactoring or modify unrelated files.
- Obtain the user's approval before deleting data or making database changes that break the existing schema or compatibility.
- Do not expose students' personal information, authentication credentials, or secret keys in logs or the repository.
- Perform checks relevant to each change and report the results, including any checks that could not be completed.
- Before adding a library or dependency, evaluate whether existing functionality can meet the need.

## Comment Style

- Prefer one short comment per logical block or function. Do not annotate every line or repeat names and operations that the code already makes clear.
- Explain intent, constraints, non-obvious behavior, and important ordering. Keep setup tutorials and lengthy background explanations in README rather than source comments.
- Where useful, pair concise English and Korean in one short line or a two-line block. Bilingual comments are preferred, but do not add redundant comments just to translate obvious code.
- Avoid duplicate explanations in file headers, docstrings, and inline comments. Use brief section labels only when they help navigate longer files; preserve tool-required directives.

## Transfer Information Requests

- UI: `frontend/src/components/TransferRequest/`, below the curriculum cards. Localized copy and education choices: `frontend/src/lib/i18n/survey.ts`. The native dialog supports keyboard focus, Escape, pending, success, validation, and network failure states.
- API: `backend/surveys/views.py`, routed by `backend/config/urls.py`. Requests use CSRF cookies and `X-CSRFToken`; never disable CSRF protection. Only creation is exposed; no public listing of personal information exists.
- Development: run Django on port 8000 and Next.js on port 3000. Next.js dev and the static preview proxy `/api/` to `BACKEND_ORIGIN` (default `http://127.0.0.1:8000`). Build remains a static export.
- Set `DJANGO_CSRF_TRUSTED_ORIGINS` to comma-separated public frontend origins when necessary (development default: localhost and 127.0.0.1 on port 3000; production default: empty). Preserve public Host in proxies and configure `DJANGO_ALLOWED_HOSTS`.
- Docker renders `frontend/nginx.conf` with `scripts/start-nginx.sh`, substituting only `BACKEND_ORIGIN`. Use an HTTP(S) origin without a path or trailing slash. No background job service was added.
- Run backend tests against the separate test DB. For browser submission tests use an isolated temporary database, never real student data or the main SQLite database.

## Survey CSV Export

- Run `export-surveys.cmd` from `backend/`, `backend/export-surveys.cmd` from the project root, or invoke its absolute path from another working directory. The launcher resolves `.venv/Scripts/python.exe` and `manage.py` relative to its own location without changing the caller's working directory. It uses `backend/.venv/Scripts/python.exe` and forwards arguments and exit codes to `manage.py export_surveys`; no running server or SQLite CLI executable is required.
- Implementation: `backend/surveys/management/commands/export_surveys.py`. Supports `--output <path.csv>` and explicit `--overwrite`. Relative output paths resolve against the caller's working directory; the default is always the project-root `exports/survey_responses_<Seoul timestamp>.csv`.
- Exports all rows by ascending ID using a chunked ORM iterator. Column order: id, email, age, education_type, desired_university, created_at. Uses UTF-8 BOM, quoted CSV cells, empty optional university values, original education codes, and ISO 8601 timestamps in Asia/Seoul with a numeric offset.
- Formula-like text is prefixed with an apostrophe in the CSV only. This is a spreadsheet-viewing export, not a byte-exact database backup; spreadsheet re-saving/import behavior can change escaping.
- Write a temporary sibling file and publish only when complete. Default publication never overwrites an existing destination; explicit overwrite atomically replaces it. Missing databases are not created. Only output path and row count are printed on success, never individual responses.
- `/exports/` is Git-ignored because it contains personal information. Custom output paths are the operator's responsibility. No model, migration, API, dependency, or worker changes are required by this feature.
- Tests: `manage.py test surveys.test_export` (including Windows launcher execution from the backend, project root, and an unrelated directory, a separately migrated synthetic SQLite database, paths containing spaces/Korean characters, exit codes, CSV safety, failed writes, and chunk boundaries). The full backend suite remains `manage.py test surveys config.test_settings`.


## Cloudtype Deployment

- Root `Dockerfile` builds a combined Nginx/Gunicorn image; `backend/Dockerfile` uses the repository ROOT as build context for standalone deployment. The root `backend` target also supports standalone operation. Frontend standalone builds continue to use `frontend/` as context.
- Production dependencies are pinned separately in `backend/requirements-production.txt`. Runtime uses UID/GID 1000, public port 8080 (combined) or 8000 (backend). Supervisor stops the combined container when either server exits; no job worker is added.
- Mount persistent storage at `/app/backend/data`, writable by UID/GID 1000. `deploy/prepare_database.py` refuses missing mounts, checks write access, backs up an existing DB before pending migrations, applies migrations, and fails startup on errors. A mount check cannot prove storage durability. Verify Cloudtype support, SQLite locking semantics, disk lifecycle and permissions in the actual account before deployment. Use one replica and Recreate; do not overlap old writers and migrations.
- `PUBLIC_SCHEME=https` normalizes the forwarded scheme at Nginx. Use only behind an HTTPS-enforcing ingress. Enable `DJANGO_TRUST_PROXY=1` only for trusted proxy traffic. Configure secure cookies, explicit public hosts/origins and redirect hostname per README. Keep the standalone backend private if it trusts forwarded headers.
- `GET /api/health/` checks the survey table and returns only an availability boolean (200/503), without personal data. Existing survey APIs and schema are unchanged.
- `deploy/verify-deployment.py` tests an isolated Docker volume, CSRF submission, container replacement persistence and server failure. It never uses real survey DBs. Run backend tests with `manage.py test surveys config.test_settings config.test_health`.
- Pre-migration backups remain on the same disk. Offsite backup, retention and restore drills are operational requirements, not implemented automation. Do not delete or recreate a production disk during deployment. Never ship local DBs or secrets in images.
