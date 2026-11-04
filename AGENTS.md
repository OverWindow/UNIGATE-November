## Project Structure

- `frontend/`: UNIGATE Next.js 프론트엔드. `src/`에 페이지·컴포넌트·스타일·공통 코드, `public/`에 정적 자산을 둡니다.
- `frontend-TOPIQ/`: TOPIQ Next.js 프론트엔드. `src/`에 페이지·컴포넌트·공통 코드, `tests/`에 테스트를 둡니다.
- `backend/`: 두 프론트엔드가 공유하는 Django 백엔드.
  - `config/`: 설정과 공통 라우팅.
  - `accounts/`, `surveys/`, `pbt/`, `question_bank/`: 인증·신청·PBT·문제은행 앱.
  - `migration/`: 앱별 DB 마이그레이션.
  - `deploy/`: 서버 실행·배포 설정.

## Working Guidelines

- `frontend/` 또는 `frontend-TOPIQ/`의 파일을 수정하기 전에 해당 폴더의 `AGENTS.md`가 있으면 읽고, 루트 지침과 함께 따릅니다.
- Keep code as simple as possible. Implement only what is needed for existing functionality and the current request to work. Do not design for unrequested features, hypothetical future requirements, or speculative extension points. Avoid unnecessary abstractions and complexity.
- Keep this document limited to the technology stack, a brief project structure, and working guidelines. Do not append feature descriptions, operational procedures, implementation histories, or per-task summaries. Update these three sections only when necessary.
- Before making changes, explain the proposed steps, affected files or systems, expected API or database changes, and relevant verification. Ask for explicit approval and wait, unless the user explicitly waives this step. The initial task request alone is not approval of an unpresented plan.
- Read-only inspection is allowed before approval. Do not edit files, install dependencies, or change database or service state until approved. Proceed within the approved scope without repeated approval requests; obtain approval for material scope changes.
- Keep changes within the requested scope. Do not perform unrelated refactoring or modify unrelated files.
- If instructions are unclear or open to multiple interpretations, ask for clarification and wait before proceeding with dependent work.
- Evaluate existing functionality before adding a dependency. Reuse existing tables and relationships where possible; add tables only for a clear, current requirement.
- DB 구조 변경은 `backend/migration/<기능명>/*.py`의 Django migration으로만 관리합니다. 별도 `.sql` 파일을 추가하거나 migration을 우회하여 DB에 SQL을 직접 실행하지 않습니다.
- 로컬 `migrate`는 사용자가 직접 실행합니다. 에이전트는 임의로 실행하거나 `runserver`에 자동 적용을 추가하지 않습니다. 운영은 기존 `deploy/start.sh`의 `migrate` 후 Gunicorn 시작 절차를 유지합니다.
- 관리 명령이나 실행 스크립트를 추가·변경하거나 기능 사용에 별도 실행이 필요하면, 완료 보고에 목적·정확한 명령·실행 위치와 시점·DB 변경 여부·자동/수동 실행 여부를 반드시 안내합니다. 필요한 수동 단계를 빠뜨리지 말고, 상세 사용법은 README에 기록합니다.
- Before adding or configuring a background worker, explain its purpose and obtain approval.
- Obtain approval before deleting data or making database changes that break schema compatibility.
- Do not expose personal information, student information, API keys, database connection strings, credentials, or secrets in logs or the repository. Never print environment file values or commit secrets.
- After every modification, state whether APIs or database tables were added. For new APIs, list the HTTP method, path, and purpose; for new tables, list the name and purpose. Explicitly state when none were added.
- Keep comments short and explain intent, constraints, or non-obvious behavior. Avoid line-by-line narration and duplicate explanations. Concise English/Korean comments are welcome where useful; keep lengthy setup instructions in README.
