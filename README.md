# Unigate

## 프로젝트 구조

- `unigate_frontend/`: React + Vite (JavaScript)
- `backend/`: Django + Python + PostgreSQL (연결 설정 준비, DB 서버 별도 필요)

## 프론트엔드 실행

Node.js 24와 npm을 기준으로 설정했습니다.

```sh
cd unigate_frontend
npm ci
npm run dev
```

터미널에 출력되는 로컬 주소에서 확인할 수 있습니다.

```sh
npm run build
npm run lint
npm run preview
```

`build`는 배포용 파일을 `unigate_frontend/dist/`에 생성하고, `preview`는 빌드 결과를 로컬에서 확인합니다.

## 프론트엔드 Docker 실행 (운영용 정적 서버)

프로젝트 루트에서 Linux 컨테이너로 빌드하고 실행합니다.

```powershell
docker build --pull -t unigate-frontend ./unigate_frontend
docker run --rm --name unigate-frontend -p 127.0.0.1:8080:8080 unigate-frontend
```

`http://127.0.0.1:8080/`에서 확인합니다. Node.js 24 단계에서 `npm ci`와 빌드를 수행하고,
최종 이미지에서는 Nginx가 일반 사용자 권한으로 `dist`를 제공합니다. 소스 변경 시 이미지를 다시 빌드합니다.
`nginx.conf`는 SPA 하위 경로 새로고침, HTML 재검증, 정적 파일 압축을 처리합니다.
Vite의 `/assets/` 파일은 콘텐츠 해시 이름을 전제로 장기 캐시합니다. `public/assets/`에는
해시 없는 파일을 넣지 마세요. 없는 정적 파일과 미연결 `/api/` 요청은 404를 반환합니다.

이 컨테이너는 HTTP 8080을 제공합니다. 실제 운영에서는 앞단 로드 밸런서 또는 리버스 프록시에서
도메인과 HTTPS 인증서를 설정하고 이 포트로 전달하세요. 위 실행 예시는 로컬 확인용 바인딩입니다.
백엔드 프록시와 TLS 인증서 설정은 아직 포함하지 않았습니다.
`.env*`는 빌드 컨텍스트에서 제외하며, 현재 Dockerfile에는 환경별 빌드 변수 주입이 없습니다.
향후 `VITE_*` 설정을 추가한다면 브라우저에 공개되는 빌드 시점 값으로 취급하고 비밀 값을 넣지 마세요.
컨테이너 실행 시 `-e`로 전달한 변수는 이미 빌드된 프론트엔드를 바꾸지 않습니다.

## 백엔드 실행

Python 3.13 기준입니다. 아래 명령은 프로젝트 루트에서 PowerShell로 실행합니다.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.development.example .env.development
Copy-Item .env.production.example .env.production
```

이미 환경 파일이 있다면 복사 명령으로 덮어쓰지 마세요. `.env.development`에 `DJANGO_SECRET_KEY`와
PostgreSQL 접속 정보를 입력합니다. `DJANGO_DEBUG=True`는 로컬 개발용입니다.
운영 설정은 `.env.production`에 별도로 입력합니다. `DJANGO_DEBUG=False`와 실제 서비스 호스트,
운영 전용 비밀 키 및 DB 접속 정보가 필요합니다. 운영 필수 값이 없거나 DEBUG가 True면 실행을 중단합니다.

`DJANGO_ENV`는 실행하는 터미널 또는 배포 환경에서 지정합니다. 생략하면 `development`입니다.
선택한 파일만 읽으며 기존 `.env`는 읽지 않습니다. OS 환경 변수가 파일보다 우선합니다.
파일 없이 OS 환경 변수만으로도 실행할 수 있습니다.

```powershell
$env:DJANGO_ENV = "development"  # .env.development 선택
# 운영 설정 검사 시 (실제 운영 값 입력 후)
$env:DJANGO_ENV = "production"  # .env.production 선택
.\.venv\Scripts\python.exe manage.py check
# 로컬 개발로 돌아가기
$env:DJANGO_ENV = "development"
```

`runserver`는 개발용이며, 운영 컨테이너는 아래의 Gunicorn 구성을 사용합니다.
`migrate`도 선택한 환경의 DB에 적용되므로 실행 전에 DJANGO_ENV를 확인하세요.

PostgreSQL 서버와 데이터베이스, 접속 계정은 별도로 준비해야 합니다.
`migrate`는 지정한 DB 안에 테이블을 생성하며, DB 서버나 데이터베이스 자체를 만들지는 않습니다.
로컬 테스트 DB로 PostgreSQL 17 컨테이너 `test-db`를 생성했습니다. PC 접속 주소는 `127.0.0.1:5433`,
DB 이름은 `unigate_test`, 사용자는 `unigate`이며 데이터는 `test-db-data` 볼륨에 저장됩니다.
비밀번호는 Git에서 제외되는 `backend/.env.test-db`에 저장되어 있습니다.
Django 연결 시 해당 접속 정보를 `.env.development`에 설정해야 합니다. `.env.test-db`는 자동으로 읽지 않습니다.
마이그레이션은 아직 실행하지 않았습니다. 컨테이너 중지·재시작은 `docker stop test-db`, `docker start test-db`로 합니다.

```powershell
.\.venv\Scripts\python.exe manage.py check
# PostgreSQL 준비 및 선택한 환경 파일 입력 후 실행
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver
```

개발 서버는 `http://127.0.0.1:8000/`, 관리자 화면은 `/admin/`입니다.
업무용 API와 모델은 아직 없으며, 기본 인증·권한·세션·관리자 앱을 사용합니다.
기본 사용자 모델은 Django의 `auth.User`입니다.
사용자 모델을 교체하려면 첫 마이그레이션 전에 결정하는 것이 좋습니다.

- `backend/config/settings.py`: 환경 변수, PostgreSQL 및 Django 기본 설정
- `backend/config/urls.py`: 관리자 URL 연결
- `backend/config/asgi.py`, `backend/config/wsgi.py`: 서버 진입점
- `backend/manage.py`: Django 관리 명령
- `backend/requirements.txt`: 검증한 의존성 버전
- `backend/.env.development.example`, `backend/.env.production.example`: 비밀 값이 없는 환경별 예시

## 백엔드 Docker 실행 (운영용 WSGI 서버)

Docker에서 Linux 컨테이너를 실행할 수 있어야 합니다. 프로젝트 루트에서 실행합니다.

```powershell
docker build --pull -t unigate-backend ./backend
docker run --rm --name unigate-backend --stop-timeout 35 -p 127.0.0.1:8000:8000 --env-file backend/.env.production -e DJANGO_ENV=production unigate-backend
```

`.env.production`에 운영 전용 비밀 키, 허용 호스트, DB 접속 정보를 먼저 설정하세요.
이미지는 기본적으로 `DJANGO_ENV=production`을 사용하고 필수 값 누락 또는 DEBUG=True이면 시작하지 않습니다.
환경 파일과 로컬 가상환경은 이미지에 포함되지 않으며, `--env-file`로 실행 시 환경 변수를 전달합니다.
컨테이너 내부의 `localhost`는 컨테이너 자신입니다. Windows Docker Desktop에서 호스트 PC의
PostgreSQL에 연결한다면 실행 명령에 `-e POSTGRES_HOST=host.docker.internal`을 추가하세요.
DB 서버에서 해당 연결을 허용해야 하며, 다른 컨테이너의 DB는 같은 Docker 네트워크에서 DB 컨테이너 이름을 사용합니다.

이 이미지는 일반 사용자 권한으로 Gunicorn에서 `config.wsgi:application`을 실행합니다.
`backend/gunicorn.conf.py`는 HTTP 8000, 요청 처리 프로세스 2개, 요청 처리 제한과 정상 종료 대기 시간 각각
30초를 기본값으로 사용합니다. `-e WEB_CONCURRENCY=4`처럼 프로세스 수를 조절할 수 있고,
추가 Gunicorn 옵션은 `GUNICORN_CMD_ARGS`로 전달할 수 있습니다.
접근 로그는 메서드·경로·상태·처리 시간만 stdout에, 오류 로그는 stderr에 기록합니다.
URL 경로에도 개인정보를 넣지 마세요. 컨테이너 종료 대기 시간은 Gunicorn의 정상 종료 대기 시간보다 길게 둡니다.
Gunicorn은 Linux 컨테이너에서 사용하며 Windows 가상환경에서는 설치 대상에서 제외됩니다.
로컬 개발은 기존 `manage.py runserver` 명령을 사용합니다. 소스 변경 시 이미지를 다시 빌드하세요.

HTTPS와 프론트엔드 Nginx의 백엔드 프록시는 아직 연결하지 않았습니다.
Gunicorn은 관리자 화면의 CSS/JS를 제공하지 않습니다. 배포 시 `collectstatic` 결과를 별도 Nginx나
정적 호스팅에 배치해야 합니다. 아래 명령은 결과를 호스트의 `backend/staticfiles`에 수집합니다.

```powershell
New-Item -ItemType Directory -Force backend/staticfiles | Out-Null
docker run --rm --env-file backend/.env.production -e DJANGO_ENV=production --mount "type=bind,source=$((Resolve-Path backend/staticfiles).Path),target=/app/staticfiles" unigate-backend python manage.py collectstatic --noinput
docker run --rm --env-file backend/.env.production -e DJANGO_ENV=production unigate-backend python manage.py check --deploy
```

Linux 호스트에서는 수집 디렉터리에 컨테이너 사용자 UID/GID 10001의 쓰기 권한이 필요합니다.
실제 공개 전에는 HTTPS 구성에 맞춰 Django의 보안 쿠키·HTTPS 리다이렉트·프록시 신뢰 설정을 적용하고
`check --deploy` 경고를 검토해야 합니다. PostgreSQL을 생성하거나 마이그레이션을 자동 실행하지 않습니다.

## Git

프로젝트 루트에서 unigate_frontend와 backend를 하나의 저장소로 관리합니다.
의존성, 빌드 결과, 환경 변수 파일은 Git에서 제외합니다.
`unigate_frontend/package-lock.json`은 동일한 의존성 설치를 위해 버전 관리합니다.
실제 `.env.development`, `.env.production`는 Git에서 제외하고 `.env.development.example`, `.env.production.example`만 공유합니다.
