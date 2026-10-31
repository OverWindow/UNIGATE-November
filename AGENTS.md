# Project Overview

Unigate is a web service for university transfer admissions and Korean language education.

## Technology Stack and Current Status

- Frontend: React and React DOM with Vite, using JavaScript and JSX, ES modules, and plain CSS. The frontend currently contains the starter application.
- Frontend tooling: `@vitejs/plugin-react` and Oxlint, configured in `frontend/vite.config.js` and `frontend/.oxlintrc.json`.
- Runtime and package management: Node.js 24 and npm, as documented in the root README. Keep `frontend/package-lock.json` under version control and use `npm ci` for reproducible installs. Refer to `frontend/package.json` and the lockfile for dependency versions.
- Backend: `backend/` contains only `.gitkeep`. The previous Django implementation was intentionally removed; there is currently no runnable backend, backend Docker configuration, API, or database integration in this repository. Do not assume that external database resources were removed along with the source files.
- Frontend Docker: `frontend/Dockerfile` builds with Node.js 24 and serves static files through unprivileged Nginx on HTTP 8080. `nginx.conf` handles SPA fallback and caching; `.dockerignore` excludes local artifacts and environment files. HTTPS and backend proxy routing require deployment-specific configuration.
- The repository contains one frontend (`frontend/`) and one backend placeholder (`backend/`), managed in one Git repository at the project root.

## Project Structure

```text
unigate-main/
|-- AGENTS.md                 # Project context and agent working guidelines
|-- DESIGN.md                 # Homepage-based visual guidelines and official logo reference
|-- README.md                 # Project overview and local development instructions
|-- .gitignore                # Excludes dependencies, builds, secrets, and Python artifacts
|-- backend/                  # Placeholder containing only .gitkeep; no backend implementation
`-- frontend/
    |-- Dockerfile            # Production static server image
    |-- nginx.conf            # SPA routing and static caching
    |-- .dockerignore         # Docker build exclusions
    |-- package.json          # Frontend dependencies and npm scripts
    |-- package-lock.json     # Dependency lockfile
    |-- vite.config.js        # Vite configuration with the React plugin
    |-- .oxlintrc.json        # Oxlint configuration
    |-- index.html            # HTML entry point
    |-- public/               # Static assets served directly
    `-- src/
        |-- main.jsx          # React root initialization and global CSS import
        |-- App.jsx           # Root application component
        |-- App.css           # Application styles
        |-- index.css         # Global styles
        `-- assets/           # Assets imported by source code
```

`frontend/node_modules/` and `frontend/dist/` are generated directories excluded from Git.

## Development and Verification Commands

Run the following commands from `frontend/`:

- `npm ci`: Install dependencies from the lockfile.
- `npm run dev`: Start the Vite development server.
- `npm run build`: Build the frontend into `frontend/dist/`.
- `npm run lint`: Run Oxlint.
- `npm run preview`: Preview the production build locally.

There is currently no frontend test script. Backend checks, dependency installation, migrations, and deployment commands are not available because `backend/` is a placeholder. Update this document when backend setup or project structure changes, and distinguish planned components from implemented ones. Never print environment file values or commit secrets.

## Working Guidelines

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
