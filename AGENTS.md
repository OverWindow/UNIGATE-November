## Working Guidelines

- Keep code as simple as possible. Implement only what is needed for existing functionality and the current request to work. Do not design for unrequested features, hypothetical future requirements, or speculative extension points. Avoid unnecessary abstractions and complexity.
- Keep this document limited to the technology stack, a brief project structure, and working guidelines. Do not append feature descriptions, operational procedures, implementation histories, or per-task summaries. Update these three sections only when necessary.
- Before making changes, explain the proposed steps, affected files or systems, expected API or database changes, and relevant verification. Ask for explicit approval and wait, unless the user explicitly waives this step. The initial task request alone is not approval of an unpresented plan.
- Read-only inspection is allowed before approval. Do not edit files, install dependencies, or change database or service state until approved. Proceed within the approved scope without repeated approval requests; obtain approval for material scope changes.
- Keep changes within the requested scope. Do not perform unrelated refactoring or modify unrelated files.
- If instructions are unclear or open to multiple interpretations, ask for clarification and wait before proceeding with dependent work.
- Evaluate existing functionality before adding a dependency. Reuse existing tables and relationships where possible; add tables only for a clear, current requirement.
- Before adding or configuring a background worker, explain its purpose and obtain approval.
- Obtain approval before deleting data or making database changes that break schema compatibility.
- Do not expose personal information, student information, API keys, database connection strings, credentials, or secrets in logs or the repository. Never print environment file values or commit secrets.
- After every modification, state whether APIs or database tables were added. For new APIs, list the HTTP method, path, and purpose; for new tables, list the name and purpose. Explicitly state when none were added.
- Keep comments short and explain intent, constraints, or non-obvious behavior. Avoid line-by-line narration and duplicate explanations. Concise English/Korean comments are welcome where useful; keep lengthy setup instructions in README.