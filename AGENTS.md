# Project Working Guidelines

## Technology Stack

- Frontends: Next.js 16 App Router, React 19, TypeScript 5.9, and Tailwind CSS v4. The Unigate frontend in `frontend/` supports Indonesian, Korean, and English and exports static files to `frontend/out/`. The TOPIQ frontend in `frontend-TOPIQ/` uses the standard Next.js build in `.next/`.
- Frontend tooling: Node.js 24, npm, strict TypeScript checks, and Oxlint. Keep each frontend's `package-lock.json` tracked and use `npm ci`.
- Backend: Python 3.13 and Django 5.2; entry point: `backend/manage.py`. Both frontends use this existing backend.
- Backend tooling: Project-local `backend/.venv/`, pip, pinned `requirements.txt` and `requirements-production.txt`, and Django's test runner with unittest-based configuration tests.
- Data: PostgreSQL 16 with Psycopg 3; local Docker container `unigate-test-db`. Django application migrations are stored in `backend/migration/`.
- Deployment: Existing separate Docker images for the Unigate frontend (Nginx) and shared backend (Gunicorn and WhiteNoise). TOPIQ currently uses the standard Next.js production server.

## Project Structure

```text
unigate-main/
|-- AGENTS.md                   # Agent working guidelines
|-- DESIGN.md                   # Visual guidelines
|-- README.md                   # Setup and usage
|-- frontend/                   # Unigate frontend
|   |-- public/                 # Brand assets and static files
|   |-- src/                    # App, components, hooks, translations, styles, and types
|   |-- scripts/                # Static preview utility
|   |-- Dockerfile              # Frontend deployment image
|   |-- nginx.conf              # Static file server configuration
|   |-- package.json            # Dependencies and scripts
|   `-- package-lock.json       # Locked npm dependencies
|-- frontend-TOPIQ/             # TOPIK II reading, writing, and vocabulary frontend
|   |-- AGENTS.md               # Next.js-generated agent guidance
|   |-- README.md               # TOPIQ setup and usage
|   |-- public/                 # Static files
|   |-- src/app/                # App Router pages, layout, and global styles
|   |-- next.config.ts          # Next.js configuration
|   |-- postcss.config.mjs      # Tailwind CSS PostCSS configuration
|   |-- tsconfig.json           # TypeScript configuration
|   |-- package.json            # Dependencies and scripts
|   `-- package-lock.json       # Locked npm dependencies
`-- backend/                    # Shared Django backend
    |-- config/                 # Settings, routes, CORS, health checks, and configuration tests
    |-- accounts/               # Authentication APIs and PostgreSQL rate limits
    |-- surveys/                # Survey model, API, admin, export command, and tests
    |-- migration/              # Django application migrations
    |-- deploy/                 # Gunicorn configuration and container startup
    |-- manage.py               # Django management entry point
    |-- export-surveys          # Linux survey CSV export launcher
    |-- Dockerfile              # Backend deployment image
    |-- requirements.txt        # Pinned backend dependencies
    `-- requirements-production.txt # Additional production dependencies
```

## Working Guidelines

- When the user says "TOPIQ", they mean the `frontend-TOPIQ/` folder: the frontend for TOPIK II reading and writing questions and vocabulary lists.
- When the user says "unigate" (case-insensitive), they mean the `frontend/` folder: the existing Unigate frontend.
- Both frontends use the existing Django backend in `backend/`.
- Keep code as simple as possible. Implement only what is needed for existing functionality and the current request to work. Do not design for unrequested features, hypothetical future requirements, or speculative extension points. Avoid unnecessary abstractions and complexity.
- Keep this document limited to the technology stack, a brief project structure, and working guidelines. Do not append feature descriptions, operational procedures, implementation histories, or per-task summaries. Update these three sections only when necessary.
- Before making changes, explain the proposed steps, affected files or systems, expected API or database changes, and relevant verification. Ask for explicit approval and wait, unless the user explicitly waives this step. The initial task request alone is not approval of an unpresented plan.
- Read-only inspection is allowed before approval. Do not edit files, install dependencies, or change database or service state until approved. Proceed within the approved scope without repeated approval requests; obtain approval for material scope changes.
- Keep changes within the requested scope. Do not perform unrelated refactoring or modify unrelated files.
- If instructions are unclear or open to multiple interpretations, ask for clarification and wait before proceeding with dependent work.
- Write `AGENTS.md` and `DESIGN.md` exclusively in English. This does not restrict interface languages or source-code comments.
- For UI changes, follow the existing Next.js/React layouts and styling in the relevant frontend. Read and follow `DESIGN.md` before changing frontend design.
- Evaluate existing functionality before adding a dependency. Reuse existing tables and relationships where possible; add tables only for a clear, current requirement.
- Before adding or configuring a background worker, explain its purpose and obtain approval.
- Obtain approval before deleting data or making database changes that break schema compatibility.
- Do not expose personal information, student information, API keys, database connection strings, credentials, or secrets in logs or the repository. Never print environment file values or commit secrets.
- Preserve CSRF protection. Use isolated PostgreSQL test databases and synthetic data for tests; use temporary databases for any other local storage. Do not call live paid AI APIs or write to production databases or services during tests.
- Run checks relevant to the change and report results, including checks that could not be completed. Consult README and package scripts for setup and verification commands.
- After every modification, state whether APIs or database tables were added. For new APIs, list the HTTP method, path, and purpose; for new tables, list the name and purpose. Explicitly state when none were added.
- Keep comments short and explain intent, constraints, or non-obvious behavior. Avoid line-by-line narration and duplicate explanations. Concise English/Korean comments are welcome where useful; keep lengthy setup instructions in README.
