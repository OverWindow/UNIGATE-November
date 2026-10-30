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

`runserver`는 개발용이며, 운영 배포는 별도 WSGI/ASGI 서버 구성이 필요합니다.
`migrate`도 선택한 환경의 DB에 적용되므로 실행 전에 DJANGO_ENV를 확인하세요.

PostgreSQL 서버와 데이터베이스, 접속 계정은 별도로 준비해야 합니다.
`migrate`는 지정한 DB 안에 테이블을 생성하며, DB 서버나 데이터베이스 자체를 만들지는 않습니다.
현재는 DB 연결 설정만 준비했으며 마이그레이션을 실행하지 않았습니다.

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

## Git

프로젝트 루트에서 unigate_frontend와 backend를 하나의 저장소로 관리합니다.
의존성, 빌드 결과, 환경 변수 파일은 Git에서 제외합니다.
`unigate_frontend/package-lock.json`은 동일한 의존성 설치를 위해 버전 관리합니다.
실제 `.env.development`, `.env.production`는 Git에서 제외하고 `.env.development.example`, `.env.production.example`만 공유합니다.
