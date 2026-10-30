# Unigate

대학 편입·한국어 교육 서비스입니다. React + Vite 프론트엔드와 Django + PostgreSQL 백엔드를 사용합니다.

## 어떤 방법으로 실행하나요?

| 목적 | 실행 방법 | 필요한 프로그램 |
|---|---|---|
| **디자인·화면 수정** | [프론트엔드 개발 실행](#1-프론트엔드-개발-실행) | Node.js 24 |
| API·DB 개발 | [백엔드 개발 실행](#2-백엔드-개발-실행) | Python 3.13, PostgreSQL |
| 배포 이미지 확인 | [Docker 실행](#3-docker-실행) | Docker Desktop 또는 Docker Engine (Linux 컨테이너) |

아래 명령은 **Windows PowerShell** 기준입니다. 각 절은 **프로젝트 루트(`unigate-main`)에서 시작**합니다.
실행 중인 개발 서버는 터미널에서 `Ctrl+C`로 종료합니다.

## 1. 프론트엔드 개발 실행

**디자인 작업은 이것만 실행하면 됩니다. 현재 화면 실행에는 Python·DB·Docker 설정이 필요 없습니다.**
프로젝트를 내려받고 Node.js 24를 설치한 뒤 진행하세요.

### 처음 실행할 때

```powershell
cd unigate_frontend
npm ci
npm run dev -- --open
```

브라우저가 자동으로 열립니다. 접속 주소는 터미널에 표시되며, 기본값은 `http://localhost:5173/`입니다.
React·CSS 파일을 수정하고 저장하면 화면에 반영됩니다.

### 다음부터 실행할 때

```powershell
cd unigate_frontend
npm run dev -- --open
```

의존성(`package.json` 또는 `package-lock.json`)이 바뀌었다면 실행 전에 `npm ci`를 다시 실행하세요.

| 수정할 내용 | 파일 |
|---|---|
| 화면 구성 | `unigate_frontend/src/App.jsx` |
| 화면 스타일 | `unigate_frontend/src/App.css` |
| 공통 스타일 | `unigate_frontend/src/index.css` |
| 디자인 기준 | `DESIGN.md` — 디자인 변경 전에 확인 |

## 2. 백엔드 개발 실행

Python 3.13과 **접속 가능한 PostgreSQL 서버·DB·계정**이 필요합니다.
프론트엔드도 함께 개발하려면 별도 터미널에서 1번 절을 실행하세요.

### 최초 설정

```powershell
cd backend
python --version
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (!(Test-Path .env.development)) {
    Copy-Item .env.development.example .env.development
}
```

`python --version`이 3.13인지 확인하세요. 가상환경 활성화 없이 아래 명령들을 사용할 수 있습니다.
`backend/.env.development`를 열어 개발용 `DJANGO_SECRET_KEY`와 PostgreSQL 접속 정보를 입력하세요.

### DB 준비 후 최초 실행

아래 명령은 위에서 이동한 `backend/`에서 실행합니다.
**`migrate`는 선택한 DB의 테이블을 생성·변경하므로 개발용 DB 연결인지 먼저 확인하세요.**
DB 서버나 데이터베이스 자체를 생성하지는 않습니다.

```powershell
$env:DJANGO_ENV = "development"
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver
```

`createsuperuser`는 관리자 계정이 필요할 때 한 번 실행합니다.
관리자 화면은 `http://127.0.0.1:8000/admin/`입니다. 현재 업무용 API는 없으므로 루트(`/`)는 404가 정상입니다.

### 다음부터 실행할 때

```powershell
cd backend
$env:DJANGO_ENV = "development"
.\.venv\Scripts\python.exe manage.py runserver
```

의존성이 변경되면 `pip install -r requirements.txt`를 가상환경 Python으로 다시 실행하세요.
새 마이그레이션이 추가되면 연결할 DB를 확인한 뒤 `manage.py migrate`를 실행합니다.

<details>
<summary>환경 변수와 기존 로컬 테스트 DB 참고</summary>

- 로컬 기본 환경은 `development`이며, `.env.development`를 읽습니다. `production`은 `.env.production`을 읽습니다.
- OS 환경 변수가 파일보다 우선합니다. `.env`와 `.env.test-db`는 자동으로 읽지 않습니다.
- 운영 환경에서는 필수 접속 정보·허용 호스트·비밀 키가 필요하고 `DJANGO_DEBUG=True`를 허용하지 않습니다.
- 기존 개발 PC에는 PostgreSQL 17 컨테이너 `test-db`가 준비되어 있습니다. **다른 팀원 PC에는 자동으로 생성되지 않습니다.**
- 해당 PC의 접속 주소는 `127.0.0.1:5433`, DB는 `unigate_test`, 사용자는 `unigate`, 볼륨은 `test-db-data`입니다.
- 해당 PC의 비밀번호는 Git에서 제외된 `backend/.env.test-db`에 있습니다. 접속 정보를 `.env.development`에 반영해야 합니다.
- 기존 컨테이너는 `docker start test-db` / `docker stop test-db`로 시작·중지합니다. 최초 준비 당시 마이그레이션은 적용하지 않았습니다.
- 현재 기본 사용자 모델은 Django `auth.User`입니다. 교체할 계획이라면 첫 마이그레이션 전에 결정하세요.

</details>

## 3. Docker 실행

**배포용 이미지 확인 방법입니다. 디자인 수정 시에는 1번 개발 서버를 사용하세요.**
Docker를 먼저 실행하고 Linux 컨테이너 모드를 사용합니다. 소스 변경 시 이미지를 다시 빌드해야 합니다.
아래 포트는 로컬 PC에만 공개됩니다.

### 프론트엔드

프로젝트 루트에서 실행합니다.

```powershell
docker build --pull -t unigate-frontend ./unigate_frontend
docker run --rm --name unigate-frontend -p 127.0.0.1:8080:8080 unigate-frontend
```

접속: `http://127.0.0.1:8080/`. Node.js 24로 빌드한 정적 파일을 Nginx가 제공합니다.
종료는 다른 터미널에서 `docker stop unigate-frontend`를 실행합니다.

### 백엔드

프로젝트 루트에서 운영 환경 파일을 처음 한 번 준비합니다.

```powershell
if (!(Test-Path backend/.env.production)) {
    Copy-Item backend/.env.production.example backend/.env.production
}
```

`backend/.env.production`에 운영 전용 비밀 키, 허용 호스트, DB 접속 정보를 입력하고 `DJANGO_DEBUG=False`로 설정하세요.
접속할 PostgreSQL은 별도로 준비해야 합니다.

```powershell
docker build --pull -t unigate-backend ./backend
docker run --rm --name unigate-backend --stop-timeout 35 -p 127.0.0.1:8000:8000 --env-file backend/.env.production -e DJANGO_ENV=production unigate-backend
```

Gunicorn이 HTTP 8000에서 실행됩니다. 종료는 다른 터미널에서 `docker stop -t 35 unigate-backend`를 실행합니다.
DB 준비·마이그레이션은 자동 실행하지 않습니다. 관리자 로그인에는 기본 테이블이 준비되어 있어야 합니다.

**컨테이너의 `localhost`는 컨테이너 자신입니다.** Windows Docker Desktop에서 호스트 PC의 DB에 연결하려면
위 명령의 `unigate-backend` 이미지 이름 앞에 `-e POSTGRES_HOST=host.docker.internal`을 추가하고,
호스트에 공개된 DB 포트를 설정하세요. DB도 컨테이너라면 같은 Docker 네트워크에서 DB 컨테이너 이름을 사용합니다.

### 실제 운영 배포 전에

현재 이미지는 **HTTPS·프론트엔드와 백엔드 간 프록시 연결·DB 구성을 포함하지 않습니다.**
프론트엔드 `/api/`는 아직 404를 반환하고, Gunicorn은 관리자 CSS/JS를 제공하지 않습니다.
배포 환경에서 도메인·HTTPS·프록시·정적 파일 호스팅을 연결해야 합니다.

<details>
<summary>정적 파일 수집과 운영 설정 검사</summary>

프로젝트 루트의 PowerShell에서 실행합니다. `collectstatic`은 정적 파일을 수집하며 DB 마이그레이션은 하지 않습니다.
수집 결과는 별도 Nginx 또는 정적 호스팅에 배치하세요.

```powershell
New-Item -ItemType Directory -Force backend/staticfiles | Out-Null
docker run --rm --env-file backend/.env.production -e DJANGO_ENV=production --mount "type=bind,source=$((Resolve-Path backend/staticfiles).Path),target=/app/staticfiles" unigate-backend python manage.py collectstatic --noinput
docker run --rm --env-file backend/.env.production -e DJANGO_ENV=production unigate-backend python manage.py check --deploy
```

Linux 호스트에서는 수집 디렉터리에 컨테이너 사용자 UID/GID 10001의 쓰기 권한이 필요합니다.
HTTPS 구성에 맞춰 보안 쿠키·HTTPS 리다이렉트·HSTS·프록시 신뢰 설정을 검토하고 배포 검사 경고를 해결하세요.

</details>

<details>
<summary>이미지와 서버 설정 참고</summary>

- 프론트엔드: 일반 사용자 권한의 Nginx, HTTP 8080, SPA fallback, gzip, HTML 재검증을 사용합니다.
- `/assets/`는 콘텐츠 해시 파일명을 전제로 장기 캐시하므로 `public/assets/`에 해시 없는 파일을 넣지 마세요.
- 프론트엔드 `.env*`는 빌드에서 제외됩니다. 현재 빌드 변수 주입은 없으며 실행 시 `-e`로 빌드된 화면을 변경할 수 없습니다. 향후 `VITE_*` 값에도 비밀 정보를 넣지 마세요.
- 백엔드: 일반 사용자 권한의 Gunicorn WSGI 서버입니다. 기본 요청 처리 프로세스는 2개, 타임아웃·정상 종료 대기는 각각 30초입니다.
- `-e WEB_CONCURRENCY=4`로 프로세스 수를 바꾸고 `GUNICORN_CMD_ARGS`로 추가 옵션을 전달할 수 있습니다. 컨테이너 종료 대기 시간은 Gunicorn 종료 대기보다 길게 둡니다.
- 접근 로그는 메서드·경로·상태·처리 시간을 stdout에, 오류 로그는 stderr에 기록합니다. URL 경로에 개인정보를 넣지 마세요.
- Gunicorn은 Windows 설치 대상에서 제외됩니다. Windows 로컬 개발은 Django `runserver`를 사용합니다.
- 환경 파일과 가상환경은 백엔드 이미지에 포함되지 않습니다. 환경 변수는 실행 시 주입합니다.

</details>

## 4. 코드 검사와 빌드

각 명령은 아래 표의 폴더에서 실행합니다. 현재 프론트엔드 테스트 스크립트는 없습니다.

| 폴더 | 명령 | 용도 |
|---|---|---|
| `unigate_frontend/` | `npm run lint` | 코드 검사 |
| `unigate_frontend/` | `npm run build` | `dist/`에 배포 파일 생성 |
| `unigate_frontend/` | `npm run preview` | 빌드 결과 로컬 확인 (운영 서버 아님) |
| `backend/` | `.\.venv\Scripts\python.exe manage.py check` | Django 설정 검사 |
| `backend/` | `.\.venv\Scripts\python.exe -m pip check` | Python 의존성 검사 |

## 프로젝트 파일 안내

| 경로 | 역할 |
|---|---|
| `unigate_frontend/src/` | React 화면과 CSS |
| `unigate_frontend/Dockerfile`, `nginx.conf` | 프론트엔드 배포 이미지·서버 설정 |
| `backend/config/` | Django 설정·URL·WSGI/ASGI 진입점 |
| `backend/Dockerfile`, `backend/gunicorn.conf.py` | 백엔드 배포 이미지·서버 설정 |
| `backend/requirements.txt` | Python 의존성 |
| `backend/.env.*.example` | 환경 변수 작성 예시 |
| `DESIGN.md`, `AGENTS.md` | 디자인 기준·프로젝트 작업 지침 |

프론트엔드와 백엔드는 하나의 Git 저장소에서 관리합니다. `package-lock.json`은 커밋하고,
의존성·빌드 결과·실제 `.env*` 파일은 커밋하지 않습니다. 환경 설정은 비밀 값 없는 `.example` 파일로 공유하세요.
