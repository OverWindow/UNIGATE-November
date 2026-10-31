## Technology Stack

- Frontend: Next.js App Router, React, TypeScript, and Tailwind CSS v4; static export to `frontend/out/`. Supports Indonesian (default), Korean, and English.
- Tooling: Node.js 24, npm, TypeScript, and Oxlint. Keep `frontend/package-lock.json` tracked and use `npm ci`.
- Backend: Python 3.13, Django 5.2, and SQLite at `backend/data/db.sqlite3`. Use `backend/.venv/` and pinned requirements files.
- Deployment: Separate Docker images for frontend (Nginx) and backend (Gunicorn).

## Project Structure

```text
unigate-main/
|-- AGENTS.md       # Agent working guidelines
|-- DESIGN.md       # Visual guidelines
|-- README.md       # Setup and usage
|-- frontend/
|   |-- public/     # Static assets
|   `-- src/        # App, components, hooks, translations, styles, and types
`-- backend/
    |-- config/     # Django settings and routes
    |-- surveys/    # Survey model, API, and export command
    |-- migration/  # App migrations
    |-- deploy/     # Container startup and database preparation
    `-- data/       # SQLite database
```

## Working Guidelines

- Keep code as simple as possible. Implement only what is needed for existing functionality and the current request to work. Do not design for unrequested features, hypothetical future requirements, or speculative extension points. Avoid unnecessary abstractions and complexity.
- Keep this document limited to the technology stack, a brief project structure, and working guidelines. Do not append feature descriptions, operational procedures, implementation histories, or per-task summaries. Update these three sections only when necessary.
- Before making changes, explain the proposed steps, affected files or systems, expected API or database changes, and relevant verification. Ask for explicit approval and wait, unless the user explicitly waives this step. The initial task request alone is not approval of an unpresented plan.
- Read-only inspection is allowed before approval. Do not edit files, install dependencies, or change database or service state until approved. Proceed within the approved scope without repeated approval requests; obtain approval for material scope changes.
- Keep changes within the requested scope. Do not perform unrelated refactoring or modify unrelated files.
- If instructions are unclear or open to multiple interpretations, ask for clarification and wait before proceeding with dependent work.
- Write `AGENTS.md` and `DESIGN.md` exclusively in English. This does not restrict interface languages or source-code comments.
- Before frontend design changes, read and follow `DESIGN.md`. Ask for clarification if it is missing or unclear.
- Evaluate existing functionality before adding a dependency. Reuse existing tables and relationships where possible; add tables only for a clear, current requirement.
- Before adding or configuring a background worker, explain its purpose and obtain approval.
- Obtain approval before deleting data or making database changes that break schema compatibility.
- Do not expose student information, credentials, or secrets in logs or the repository. Never print environment file values or commit secrets.
- Preserve CSRF protection. Use isolated test databases and synthetic data for submission tests; do not send test messages to the live Formspree endpoint.
- Run checks relevant to the change and report results, including checks that could not be completed. Consult README and package scripts for setup and verification commands.
- After every modification, state whether APIs or database tables were added. For new APIs, list the HTTP method, path, and purpose; for new tables, list the name and purpose. Explicitly state when none were added.
- Keep comments short and explain intent, constraints, or non-obvious behavior. Avoid line-by-line narration and duplicate explanations. Concise English/Korean comments are welcome where useful; keep lengthy setup instructions in README.
