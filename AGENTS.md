# Project Overview / 프로젝트 개요

Unigate is a web service for university transfer admissions and Korean language education.

Unigate는 대학 편입과 한국어 교육을 위한 웹 서비스입니다.

## Technology Stack and Current Status / 기술 구성 및 현재 상태

- Frontend: React and React DOM with Vite, using JavaScript and JSX, ES modules, and plain CSS. The frontend currently contains the starter application.
  프론트엔드: React와 React DOM, Vite를 사용하며 JavaScript와 JSX, ES 모듈, 일반 CSS로 구성합니다. 현재는 시작용 애플리케이션이 포함되어 있습니다.
- Frontend tooling: `@vitejs/plugin-react` and Oxlint, configured in `unigate_frontend/vite.config.js` and `unigate_frontend/.oxlintrc.json`.
  프론트엔드 도구: `@vitejs/plugin-react`와 Oxlint를 사용하며 설정 파일은 `unigate_frontend/vite.config.js`와 `unigate_frontend/.oxlintrc.json`입니다.
- Runtime and package management: Node.js 24 and npm, as documented in the root README. Keep `unigate_frontend/package-lock.json` under version control and use `npm ci` for reproducible installs. Refer to `unigate_frontend/package.json` and the lockfile for dependency versions.
  실행 환경 및 패키지 관리: 루트 README에 명시된 Node.js 24와 npm을 사용합니다. 동일한 의존성 설치를 위해 `unigate_frontend/package-lock.json`을 버전 관리하고 `npm ci`를 사용합니다. 의존성 버전은 `package.json`과 잠금 파일을 참고합니다.
- Backend: Python 3.13 and Django 5.2, with the project configuration in `backend/config/`. Dependencies are pinned in `backend/requirements.txt`. Use the local `backend/.venv/` virtual environment.
  백엔드: Python 3.13과 Django 5.2를 사용하며 프로젝트 설정은 `backend/config/`에 있습니다. 의존성 버전은 `backend/requirements.txt`에 고정하고 `backend/.venv/` 가상환경을 사용합니다.
- Docker: `backend/Dockerfile` runs Gunicorn with `gunicorn.conf.py` as a non-root user on HTTP 8000, defaulting to `DJANGO_ENV=production`. Build with `docker build -t unigate-backend ./backend` from the repository root and supply production environment variables at runtime. Gunicorn is pinned for non-Windows installs; Windows development still uses runserver. HTTPS, static file hosting, frontend proxy routing, PostgreSQL provisioning, and migrations remain separate deployment steps.
  Docker: `backend/Dockerfile`은 `gunicorn.conf.py`를 사용하는 Gunicorn을 일반 사용자 권한으로 HTTP 8000에서 실행하며 기본 환경은 production입니다. 저장소 루트에서 이미지를 빌드하고 운영 환경 변수는 실행 시 주입합니다. Gunicorn은 Windows 외 환경에 버전을 고정해 설치하며 Windows 개발은 runserver를 사용합니다. HTTPS·정적 파일 호스팅·프론트엔드 프록시·DB 준비·마이그레이션은 별도 배포 단계입니다.
- Database: PostgreSQL connection settings read from process environment variables or `backend/.env.development` / `backend/.env.production`, selected by `DJANGO_ENV` (development by default); see the matching `.example` files. Production requires explicit credentials and hosts and disallows DEBUG=True. A local PostgreSQL 17 container named `test-db` is provisioned at `127.0.0.1:5433` with database `unigate_test` and volume `test-db-data`. Credentials are stored in the Git-ignored `backend/.env.test-db`; Django does not load this file automatically. No migrations have been applied. Django default auth, admin, contenttypes, and sessions apps are enabled; there are no business models or APIs yet.
  데이터베이스: PostgreSQL 연결 정보는 프로세스 환경 변수 또는 `backend/.env.development`, `backend/.env.production`에서 읽습니다. `DJANGO_ENV`로 선택하며 기본값은 `development`입니다. 공유용 설정은 각 `.example` 파일을 참고합니다. 운영 환경은 접속 정보와 허용 호스트를 명시해야 하며 `DEBUG=True`를 허용하지 않습니다. 로컬 PostgreSQL 17 컨테이너 `test-db`를 `127.0.0.1:5433`에 준비했으며 DB는 `unigate_test`, 볼륨은 `test-db-data`입니다. 인증 정보는 Git에서 제외되는 `backend/.env.test-db`에 있으며 Django가 이 파일을 자동으로 읽지는 않습니다. 마이그레이션은 적용하지 않았습니다. Django 기본 인증·관리자·콘텐츠 타입·세션 앱은 활성화되어 있지만 업무용 모델과 API는 아직 없습니다.
- Frontend Docker: `unigate_frontend/Dockerfile` builds with Node.js 24 and serves static files through unprivileged Nginx on HTTP 8080. `nginx.conf` handles SPA fallback and caching; `.dockerignore` excludes local artifacts and environment files. HTTPS and backend proxy routing require deployment-specific configuration.
  프론트엔드 Docker: Node.js 24로 빌드하고 일반 사용자 권한의 Nginx로 HTTP 8080에서 정적 파일을 제공합니다. `nginx.conf`는 SPA fallback과 캐시를 처리하며 `.dockerignore`는 로컬 생성물과 환경 파일을 제외합니다. HTTPS와 백엔드 프록시는 배포 환경에 맞게 별도 설정해야 합니다.
- The frontend and backend are managed in one Git repository at the project root.
  프론트엔드와 백엔드는 프로젝트 루트의 하나의 Git 저장소에서 관리합니다.

## Project Structure / 프로젝트 구조

```text
unigate-main/
|-- AGENTS.md                 # Project context and agent working guidelines / 프로젝트 맥락 및 에이전트 작업 지침
|-- DESIGN.md                 # Homepage-based visual guidelines and official logo reference / 홈페이지 기반 디자인 지침 및 공식 로고 참고
|-- README.md                 # Project overview and local development instructions / 프로젝트 개요 및 로컬 개발 안내
|-- .gitignore                # Excludes dependencies, builds, secrets, and Python artifacts / 의존성·빌드 결과·비밀 정보·Python 생성 파일 제외
|-- backend/                  # Django project, Dockerfile, gunicorn.conf.py, requirements.txt, environment examples / Django 프로젝트·운영 서버·의존성·환경 예시
`-- unigate_frontend/
    |-- Dockerfile            # Production static server image / 운영용 정적 서버 이미지
    |-- nginx.conf            # SPA routing and static caching / SPA 라우팅 및 정적 캐시
    |-- .dockerignore         # Docker build exclusions / Docker 빌드 제외 항목
    |-- package.json          # Frontend dependencies and npm scripts / 프론트엔드 의존성 및 npm 명령
    |-- package-lock.json     # Dependency lockfile / 의존성 버전 잠금 파일
    |-- vite.config.js        # Vite configuration with the React plugin / React 플러그인을 포함한 Vite 설정
    |-- .oxlintrc.json        # Oxlint configuration / Oxlint 설정
    |-- index.html            # HTML entry point / HTML 진입점
    |-- public/               # Static assets served directly / 직접 제공하는 정적 파일
    `-- src/
        |-- main.jsx          # React root initialization and global CSS import / React 초기화 및 전역 CSS 불러오기
        |-- App.jsx           # Root application component / 최상위 애플리케이션 컴포넌트
        |-- App.css           # Application styles / 애플리케이션 스타일
        |-- index.css         # Global styles / 전역 스타일
        `-- assets/           # Assets imported by source code / 소스 코드에서 불러오는 리소스
```

`unigate_frontend/node_modules/` and `unigate_frontend/dist/` are generated directories excluded from Git.

`unigate_frontend/node_modules/`와 `unigate_frontend/dist/`는 자동 생성되는 폴더이며 Git에서 제외합니다.

## Development and Verification Commands / 개발 및 검증 명령

Run the following commands from `unigate_frontend/`:

아래 명령은 `unigate_frontend/`에서 실행합니다.

- `npm ci`: Install dependencies from the lockfile.
  잠금 파일을 기준으로 의존성을 설치합니다.
- `npm run dev`: Start the Vite development server.
  Vite 개발 서버를 실행합니다.
- `npm run build`: Build the frontend into `unigate_frontend/dist/`.
  프론트엔드를 빌드하여 `unigate_frontend/dist/`에 결과를 생성합니다.
- `npm run lint`: Run Oxlint.
  Oxlint로 코드를 검사합니다.
- `npm run preview`: Preview the production build locally.
  배포용 빌드 결과를 로컬에서 확인합니다.

There is currently no frontend test script. From `backend/`, run `.venv/Scripts/python.exe manage.py check` for Django system checks and `.venv/Scripts/python.exe -m pip check` for dependency checks. Install with `.venv/Scripts/python.exe -m pip install -r requirements.txt`. PostgreSQL must be provisioned and configured before running migrations or database-backed checks. Never print environment file values or commit secrets. Update this document when backend setup or project structure changes, and distinguish planned components from implemented ones.

현재 프론트엔드 테스트 스크립트는 없습니다. `backend/`에서 `.venv/Scripts/python.exe manage.py check`로 Django 설정을 검사하고, `.venv/Scripts/python.exe -m pip check`로 의존성을 검사합니다. 의존성은 `.venv/Scripts/python.exe -m pip install -r requirements.txt`로 설치합니다. 마이그레이션이나 DB를 사용하는 검증 전에는 PostgreSQL 서버와 연결 설정이 필요합니다. 환경 파일의 값을 출력하거나 비밀 정보를 커밋하지 마세요. 백엔드 설정이나 프로젝트 구조가 바뀌면 이 문서도 갱신하고, 예정된 구성과 구현된 구성을 구분합니다.

## Working Guidelines / 작업 지침

- Before making any frontend design changes, always read and follow `DESIGN.md`. If the file is missing or its guidance is unclear, ask the user for clarification before proceeding with the design changes.
  프론트엔드 디자인 변경 전에는 반드시 `DESIGN.md`를 읽고 따릅니다. 파일이 없거나 지침이 불명확하면 디자인 작업 전에 사용자에게 확인합니다.
- If instructions or prompts are unclear or open to multiple interpretations, always ask the user for clarification instead of making assumptions. Wait for the user's response before proceeding with work that depends on that clarification.
  지시나 요청이 불명확하거나 여러 해석이 가능하면 임의로 가정하지 말고 반드시 사용자에게 확인합니다. 확인이 필요한 작업은 사용자의 답변을 기다린 뒤 진행합니다.
- After every modification, tell the user whether any APIs or database tables were added. For each new API, provide its HTTP method, path, and purpose. For each new table, provide its name and purpose. If none were added, briefly state that explicitly.
  수정 후에는 API 또는 DB 테이블 추가 여부를 사용자에게 알립니다. 새 API는 HTTP 메서드·경로·목적을, 새 테이블은 이름·목적을 설명합니다. 추가하지 않았다면 그 사실을 간단히 명시합니다.
- Avoid creating unnecessary database tables. First evaluate whether existing tables and relationships can meet the requirements. Add only the minimum number of new tables needed for a clear purpose.
  불필요한 DB 테이블을 만들지 않습니다. 기존 테이블과 관계로 요구사항을 충족할 수 있는지 먼저 검토하고, 명확한 목적에 필요한 최소한의 테이블만 추가합니다.
- Before implementing or configuring a new worker (a process or service that runs background jobs), explain why it is needed and what it will do, and always ask the user for approval.
  새 워커(백그라운드 작업을 실행하는 프로세스 또는 서비스)를 구현하거나 설정하기 전에 필요성과 수행할 작업을 설명하고 반드시 사용자의 승인을 받습니다.
- Keep changes within the requested scope. Do not perform unrelated refactoring or modify unrelated files.
  변경은 요청된 범위로 제한합니다. 관련 없는 리팩터링이나 파일 수정은 하지 않습니다.
- Obtain the user's approval before deleting data or making database changes that break the existing schema or compatibility.
  데이터를 삭제하거나 기존 DB 스키마 또는 호환성을 깨뜨리는 변경을 하기 전에는 사용자의 승인을 받습니다.
- Do not expose students' personal information, authentication credentials, or secret keys in logs or the repository.
  학생 개인정보, 인증 정보, 비밀 키를 로그나 저장소에 노출하지 않습니다.
- Perform checks relevant to each change and report the results, including any checks that could not be completed.
  변경에 적합한 검증을 수행하고 결과를 보고합니다. 완료하지 못한 검증도 함께 알립니다.
- Before adding a library or dependency, evaluate whether existing functionality can meet the need.
  라이브러리나 의존성을 추가하기 전에 기존 기능으로 요구사항을 충족할 수 있는지 검토합니다.

## Comment Style / 주석 작성 방식

- Prefer one short comment per logical block or function. Do not annotate every line or repeat names and operations that the code already makes clear.
  기능 블록이나 함수 단위로 짧게 설명합니다. 줄마다 주석을 달거나 코드에서 명확한 이름·동작을 그대로 반복하지 않습니다.
- Explain intent, constraints, non-obvious behavior, and important ordering. Keep setup tutorials and lengthy background explanations in README rather than source comments.
  의도·제약·이해하기 어려운 동작·중요한 실행 순서를 설명합니다. 설치 안내나 긴 배경 설명은 소스 주석 대신 README에 작성합니다.
- Where useful, pair concise English and Korean in one short line or a two-line block. Bilingual comments are preferred, but do not add redundant comments just to translate obvious code.
  필요한 주석에는 간결한 영어와 한국어를 짧은 한 줄 또는 두 줄 블록으로 병기합니다. 다국어 작성을 위해 자명한 코드에 불필요한 주석을 추가하지 않습니다.
- Avoid duplicate explanations in file headers, docstrings, and inline comments. Use brief section labels only when they help navigate longer files; preserve tool-required directives.
  파일 머리말·독스트링·인라인 주석에 같은 설명을 중복하지 않습니다. 긴 파일을 탐색하는 데 도움이 될 때만 짧은 구역 제목을 사용하고, 도구가 요구하는 지시문은 보존합니다.
