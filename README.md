# Unigate

대학 편입·한국어 교육 서비스입니다. Next.js + TypeScript + Tailwind CSS 홈페이지가 구현되어 있으며 한국어·영어·인도네시아어를 지원합니다.
백엔드는 Python 3.13 + Django 5.2 + PostgreSQL 구성입니다. Django 관리자·인증·세션·콘텐츠 타입 앱을 포함하며, 편입학 정보 신청 모달과 PostgreSQL 설문 응답 테이블을 연결하는 API가 있습니다.

## 프로젝트 구조

```text
unigate-main/
├─ frontend/          # Next.js 정적 내보내기 프론트엔드
│  ├─ public/         # 로고 등 정적 파일
│  ├─ src/            # React 화면과 CSS
│  ├─ Dockerfile      # 프론트엔드 배포 이미지
│  ├─ nginx.conf      # 정적 파일 서버 설정
│  ├─ package.json
│  └─ package-lock.json
├─ frontend-TOPIQ/    # TOPIK II 학습용 Next.js + TypeScript + Tailwind CSS 프론트엔드
├─ backend/           # 두 프론트엔드가 함께 사용하는 Django + PostgreSQL
│  ├─ config/         # 설정, URL, WSGI/ASGI 진입점
│  ├─ accounts/       # 기존 사용자·세션 테이블 기반 TOPIQ 인증 API
│  ├─ surveys/        # 설문 모델·API 및 테스트
│  ├─ migration/      # 앱별 마이그레이션 (surveys/ 등)
│  ├─ manage.py
│  ├─ export-surveys     # Linux 설문 CSV 내보내기 실행 파일
│  ├─ .env.example    # 환경별 예시 파일 안내
│  ├─ .env.development.example # 개발 환경 설정 예시
│  ├─ .env.production.example  # 운영 환경 설정 예시
│  └─ requirements.txt
├─ AGENTS.md          # 프로젝트 작업 지침
├─ DESIGN.md          # 디자인 기준과 공식 로고 안내
├─ README.md
└─ .gitignore
```

프론트엔드와 백엔드 폴더는 하나의 Git 저장소에서 관리합니다.
TOPIQ 개발 환경과 실행 방법은 [`frontend-TOPIQ/README.md`](frontend-TOPIQ/README.md)를 참고하세요.
`.gitkeep`은 Git에서 빈 폴더 구조를 유지하기 위한 파일입니다.

## 프론트엔드 개발 실행

Node.js 24와 npm이 필요합니다. 화면만 보는 데에는 Python·DB·Docker가 필요 없지만, 편입학 정보 신청을 저장하려면 Django 백엔드를 함께 실행해야 합니다.
아래 명령은 프로젝트 루트(`unigate-main`)에서 시작하는 Windows PowerShell 기준입니다.

처음 실행하거나 의존성(`package.json` 또는 `package-lock.json`)이 변경되었을 때:

```powershell
cd frontend
npm ci
npm run dev
```

다음부터 실행할 때:

```powershell
cd frontend
npm run dev
```

브라우저에서 `http://localhost:3000/`에 접속합니다.
React·CSS 파일을 수정하고 저장하면 화면에 반영됩니다. 서버는 터미널에서 `Ctrl+C`로 종료합니다.

| 수정할 내용 | 파일 |
|---|---|
| 화면 구성 | `frontend/src/app/page.tsx`, `frontend/src/components/` |
| 화면 스타일 | `frontend/src/styles/index.css` |
| 공통 스타일 | `frontend/src/styles/index.css` |
| 공식 로고 | `frontend/public/brand/unigate-logo.svg` |
| 디자인 기준 | `DESIGN.md` — 디자인 변경 전에 확인 |

## 코드 검사와 빌드

아래 명령은 `frontend/`에서 실행합니다.

| 명령 | 용도 |
|---|---|
| `npm run lint` | Oxlint 코드 검사 |
| `npm run typecheck` | 엄격한 TypeScript 타입 검사 |
| `npm run build` | `out/`에 정적 배포 파일 생성 |
| `npm run preview` | 빌드 후 http://127.0.0.1:3000 에서 정적 결과 확인 (운영 서버 아님) |

현재 프론트엔드 테스트 스크립트는 없습니다. 백엔드 검사 방법은 아래 절을 참고하세요.

## 백엔드 개발 실행

Python 3.13과 PostgreSQL 16을 사용합니다. 로컬 DB는 Docker 컨테이너 `unigate-test-db`이며, 데이터는 `unigate-test-db-pg16` 볼륨에 저장합니다.

```powershell
docker start unigate-test-db
```

로컬 연결은 `127.0.0.1:5433`, DB 이름은 `unigate_test`, 사용자는 `unigate`입니다.
`backend/.env.development`에 `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`를 설정합니다.
기존 컨테이너와 볼륨을 재사용하며 재생성하거나 초기화하지 않습니다. 비밀번호는 Git에 저장하지 않습니다.
프로젝트 루트에서 최초 한 번 실행합니다.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

CMD에서는 프로젝트 루트에서 다음 명령으로 가상환경을 활성화할 수 있습니다.

```cmd
backend\.venv\Scripts\activate.bat
python --version
```

이미 `backend/`에 있다면 `.venv\Scripts\activate.bat`를 실행합니다.
활성화 후에는 `python`과 `pip`가 가상환경을 사용하며, `deactivate`로 해제합니다.
다른 배치 파일 안에서 실행할 때는 `call .venv\Scripts\activate.bat`처럼 `call`을 붙입니다.
활성화 스크립트는 로컬 `.venv/`에 포함되며 Git에 커밋하지 않습니다.
가상환경 활성화는 Django 환경 변수를 설정하지 않습니다.

`backend/.env.development.example`을 `.env.development`로 복사한 뒤 `DJANGO_SECRET_KEY`를 채웁니다.
운영에서는 `.env.production.example`을 `.env.production`으로 복사하고, 별도의 지속적인 비밀 키와 실제 `DJANGO_ALLOWED_HOSTS`를 지정합니다.
실제 환경 파일은 Git에서 제외되며, 예시 파일에는 비밀 값을 넣지 않습니다.

프로세스의 `DJANGO_ENV`가 `development`이면 `.env.development`, `production`이면 `.env.production` 하나만 읽습니다.
미지정 시 개발 환경을 사용합니다. `DJANGO_ENV`는 파일 내부가 아니라 터미널 또는 서비스 실행 환경에서 지정하세요.
기존 프로세스 환경 변수가 파일보다 우선합니다. 이전 터미널에서 설정한 값이 있으면 파일을 수정해도 해당 값은 덮어쓰지 않습니다.
파일이 없어도 프로세스 환경 변수만으로 실행할 수 있지만 비밀 키가 없거나, 운영 호스트가 비어 있거나 `*`를 포함하면 실행을 거부합니다.
일반 `.env` 및 `.example` 파일은 자동으로 읽지 않으며, 다른 환경 파일로 대체하지 않습니다.
UTF-8(BOM 포함 가능)을 사용하며 `${...}` 변수 보간은 하지 않습니다. 특수문자가 있는 값은 작은따옴표로 감쌀 수 있습니다.
파일을 수정한 뒤 서버를 재시작하세요. 개발·운영 DB 연결은 각 환경의 `DB_*` 값으로 분리합니다. 필수 접속값이 없으면 시작을 거부합니다.

다음은 파일 설정을 완료한 뒤 `backend/`에서 실행하는 PowerShell 명령입니다.

```powershell
$env:DJANGO_ENV = "development"
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
```

CMD에서는 다음처럼 실행합니다.

```cmd
set "DJANGO_ENV=development"
.venv\Scripts\python.exe manage.py runserver
```

운영 서비스에는 `DJANGO_ENV=production`을 설정합니다. 이 값은 운영 서버 자체를 구성하지는 않습니다.

`manage.py migrate`는 설문 응답 테이블 `survey_responses`와 마이그레이션 이력을 준비합니다.
반복 실행해도 이미 적용된 마이그레이션을 다시 적용하지 않습니다. Django 기본 사용자·권한·세션·관리자 로그 테이블도 생성하며 기존 신청 데이터는 유지합니다.

마이그레이션은 `backend/migration/<앱 이름>/`에 보관합니다. `surveys`와 `accounts`는 각각 `migration.surveys`, `migration.accounts`를 사용합니다.
`accounts` 마이그레이션은 기존 `auth_user`에 이메일 고유 인덱스만 추가하며 테이블·컬럼을 생성하지 않습니다.
모델 변경 후 `manage.py makemigrations surveys`로 파일을 생성하고, `manage.py migrate`로 적용합니다.
검증은 `manage.py check`, `manage.py makemigrations --check --dry-run`, `manage.py test surveys config.test_settings`로 실행합니다.
환경 파일 로딩 테스트만 실행하려면 `.venv\Scripts\python.exe -m unittest config.test_settings`를 사용합니다. 실제 환경 파일 대신 테스트용 값을 사용합니다.
테스트는 Django가 생성·삭제하는 `test_<DB_NAME>` PostgreSQL DB를 사용하며 실제 설문 DB에 테스트 응답을 저장하지 않습니다. 테스트 계정에는 CREATEDB 권한이 필요합니다. 운영 환경 설정으로 테스트하지 마세요.

### PostgreSQL SQL 셸

```powershell
docker exec -it unigate-test-db psql -U unigate -d unigate_test
```

`\dt`로 테이블 목록, `\d survey_responses`로 구조를 확인하고 `\q`로 종료합니다.
로컬 `manage.py dbshell`을 사용하려면 별도로 PostgreSQL 클라이언트 `psql`을 PATH에 설치해야 합니다.
로컬 DB에는 신청 테이블, 마이그레이션 이력, 인증·관리자·세션·콘텐츠 타입 테이블을 생성합니다.
신청 테이블이 없으면 기존 `surveys` 마이그레이션으로 생성하며, 기존 테이블에 무조건 `--fake`를 적용하지 않습니다.

### 설문 응답 모델

| 컬럼 | 내용 |
|---|---|
| `id` | 자동 생성 응답 ID |
| `email` | 필수 이메일, 최대 254자, 중복 응답 허용 |
| `age` | 응답 당시 만 나이, 0~120 |
| `education_type` | 필수 학력·대학 유형 |
| `desired_university` | 선택 입력, 미입력 시 NULL |
| `created_at` | DB에서 자동 생성하는 UTC 저장 시각 |

학력·대학 유형 값은 `high_school_graduate`, `universitas`, `institut`, `sekolah_tinggi`, `politeknik`, `akademi`, `akademi_komunitas`, `other`, `unknown`입니다.
`high_school_graduate`는 고등학교 졸업 후 대학 진학 이력이 없는 경우입니다. 대학 이력이 있으면 현재 또는 마지막으로 다닌 기관 유형을 사용합니다.
교육 상태(재학·휴학·중퇴·졸업)는 별도 수집하지 않습니다.

일반 모델 `save()` 및 `objects.create()`는 `full_clean()`으로 이메일 형식과 필수값 등을 검증합니다.
이메일과 희망 대학의 앞뒤 공백을 제거하며, 빈 희망 대학은 NULL로 바꿉니다.
`bulk_create()`, `bulk_update()`, `QuerySet.update()` 및 직접 SQL은 이 검증·정규화를 우회하므로 호출 측 검증이 필요합니다.
DB 제약조건은 나이 범위, 허용된 학력·대학 유형, 공백만 있는 이메일·희망 대학을 검사합니다.
이메일 형식 검증은 모델 계층에서 수행합니다. 커리큘럼 아래 편입학 정보 신청 모달이 설문 API를 통해 이 테이블에 저장합니다.

개발 서버 주소는 `http://127.0.0.1:8000/`입니다. 루트는 404이며, 관리자 화면은 `/admin/`, 신청 API는 `/api/` 아래에 있습니다.
`Ctrl+C`로 서버를 종료합니다. 다음 실행부터는 환경 변수를 설정하고 `runserver`만 실행하면 됩니다.

`python-dotenv`로 선택한 환경 파일을 읽으며, `backend/.env.example`은 분리된 예시 파일을 안내하는 용도입니다.
`DJANGO_ENV=production`은 디버그를 끄며, 비밀 키와 명시적인 허용 호스트 설정이 필요합니다.
운영 Docker·Gunicorn 및 마이그레이션 전 백업은 아래 배포 절을 참고하세요. 공개 HTTPS는 플랫폼에서 설정하며 `runserver`는 개발용입니다.
배포 시 별도 PostgreSQL 서비스에 연결하고 DB 백업·복구 방법을 마련해야 합니다.

## TOPIQ 회원가입·로그인

TOPIQ는 Next.js에서 `/api/auth/…`와 `/api/csrf/` 요청을 기존 Django로 전달합니다.
`frontend-TOPIQ/`의 서버 전용 `DJANGO_BACKEND_URL`을 개발 서버 시작·운영 빌드 전에 지정합니다.
기본값은 `http://127.0.0.1:8000`입니다. 브라우저에 백엔드 주소나 비밀 키를 전달하지 않습니다.
프론트 실행과 인증 화면 안내는 [TOPIQ README](frontend-TOPIQ/README.md)를 참고하세요.

| 방식 | 경로 | 목적 |
| --- | --- | --- |
| `POST` | `/api/auth/email/send/` | `email`, `language`(ko/en/id), `next`(내부 경로)로 Brevo 인증 메일 발송·재발송, 202 응답 |
| `POST` | `/api/auth/email/verify/` | `token`으로 인증 링크 검증, 이메일·언어·복귀 경로·만료 시각 반환 |
| `POST` | `/api/auth/signup/` | `email`, `nickname`, `password`, `password_confirm`, `verification_token`으로 가입 후 자동 로그인 |
| `POST` | `/api/auth/login/` | 이메일·비밀번호 로그인 |
| `POST` | `/api/auth/logout/` | 현재 로그인 세션 종료, 204 응답 |
| `GET` | `/api/auth/me/` | 현재 회원 정보, 비로그인은 401 응답 |

기존 `/api/csrf/`에서 토큰을 준비하고 모든 인증 POST에 `X-CSRFToken`을 보냅니다.
가입·로그인 응답에는 `user: {id, email, nickname}`와 갱신된 `csrfToken`이 포함됩니다.
인증 응답은 `private, no-store`이며 세션 쿠키는 HttpOnly, 운영에서는 Secure, SameSite=Lax입니다.
로그인 유지 기간은 Django 기본 2주입니다.

사용자·비밀번호 해시는 `auth_user`, 로그인 상태는 `django_session`을 재사용합니다.
닉네임은 `first_name`, 내부 사용자명은 UUID 기반 `username`에 저장합니다.
`auth_user_email_ci_unique`는 `LOWER(BTRIM(email))`의 고유 인덱스이며 공백뿐인 이메일을 제외합니다.
기존 비어 있지 않은 이메일이 대소문자·공백 차이만으로 중복되면 마이그레이션이 중단됩니다.
회원 데이터를 자동 변경·병합·삭제하지 않습니다. 인덱스 제거는 `migrate accounts zero`로 되돌릴 수 있습니다.

일반 `migrate`에 포함되며 새 테이블·컬럼·DB 캐시·인증 패키지·백그라운드 워커는 추가하지 않습니다.
로그인 실패는 동일 이메일 5회/5분, 가입 시도는 5회/10분으로 제한하며 초과 시 429와 `Retry-After`를 반환합니다.
제한 정보는 서버 메모리에만 저장합니다. 재시작 시 초기화되고 여러 프로세스·서버 사이에는 공유되지 않습니다.
새 가입은 이메일 인증 → 닉네임·비밀번호 설정 순서입니다. 비밀번호 재설정·소셜 로그인은 현재 제공하지 않습니다.

Brevo는 `Unigate-PBT-Web/backend/src/email/brevo-result-email.ts`의 HTTP API 발송 방식을 참고합니다.
`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`을 백엔드 환경에 설정하고 Brevo에서 인증된 발신자를 사용하세요.
`TOPIQ_PUBLIC_URL`은 인증 링크에 넣는 신뢰된 TOPIQ origin이며 개발 기본값은 `http://localhost:3001`, 운영 기본값은 `https://topiq.unigate.kr`입니다.
API 키는 프론트엔드·저장소·로그에 넣지 않습니다. 누락 또는 발송 실패 시 503으로 표시하며 계정은 생성하지 않습니다.
실제 발송을 확인할 때는 본인 이메일로 요청하세요. 자동 테스트는 Brevo 요청을 모킹하며 실제 메일을 보내지 않습니다.

인증 토큰은 Django 전용 salt로 서명하며 15분 동안 유효합니다. 링크는 `/verify-email#token=…` 형식으로,
토큰이 HTTP URL·접근 로그에 들어가지 않게 하고 브라우저는 CSRF 보호 POST로 검증합니다.
가입 시 서명·만료·이메일 일치를 다시 검증합니다. 인증·재발송 단계에서는 DB에 사용자나 토큰을 저장하지 않습니다.
토큰을 localStorage에 저장하지 않으며 링크를 다시 열거나 새로고침하면 재검증합니다.
토큰은 만료 전 재사용할 수 있고 재발송해도 이전 링크는 만료까지 유효합니다. 가입 후 중복 생성은 이메일 고유 인덱스가 막습니다.
기존 회원·관리자와 `is_active` 값은 변경하지 않으며, 기존 계정의 과거 이메일 인증 여부를 기록하거나 추정하지 않습니다.

발송은 이메일당 60초 간격·5회/10분, 접속 피어 IP당 100회/시간으로 제한합니다.
IP는 위조 가능한 전달 헤더 대신 `REMOTE_ADDR`을 사용하므로 Next.js 같은 프록시 뒤에서는 해당 프록시의 발송 한도를 공유합니다.
카운터는 기존 메모리 캐시를 사용해 재시작 시 초기화되고 프로세스 간 공유되지 않습니다.
Brevo 요청은 10초 뒤 타임아웃 처리하며 자동 재시도하지 않습니다. 같은 Brevo 계정을 쓰면 발송 한도를 공유하고,
PBT-Web 내부 DB 집계에는 TOPIQ 발송분이 자동 포함되지 않습니다. 새 DB 마이그레이션·테이블·컬럼·DB 캐시·워커는 없습니다.

`DJANGO_CSRF_TRUSTED_ORIGINS`에는 기존 unigate origin과 TOPIQ origin을 함께 등록하세요.
개발은 `http://localhost:3001`, `http://127.0.0.1:3001`, 운영 TOPIQ는 `https://topiq.unigate.kr`입니다.
기존 설문 API의 CORS 및 운영 CSRF 쿠키 정책은 유지합니다.

검증은 `backend/`에서 실행하며 별도 PostgreSQL 테스트 DB와 합성 계정만 사용합니다.

```powershell
.\.venv\Scripts\python.exe manage.py test accounts surveys config.test_settings config.test_health config.test_cors --noinput
```

## Django 관리자

로컬 `http://127.0.0.1:8000/admin/` 또는 운영 백엔드 도메인의 `/admin/`에서 로그인합니다. 프론트 도메인이 아닙니다.
최초 관리자 계정은 `backend/`에서 대화형으로 생성하세요. 사용자명·비밀번호를 코드나 환경 예시에 넣지 않습니다.

```powershell
.\.venv\Scripts\python.exe manage.py createsuperuser
```

운영에서는 백엔드 컨테이너 터미널의 `/app/backend`에서 `python manage.py createsuperuser`를 실행합니다.
계정은 환경별 DB에 저장되므로 로컬 계정이 운영으로 복사되지 않습니다.
일반 직원은 활성 상태와 Staff 권한, 해당 모델의 조회·추가·수정·삭제 권한이 필요합니다.

신청 목록에서 이메일·희망 대학으로 검색하고 학력·신청일로 필터링할 수 있습니다. ID와 신청 시각은 읽기 전용이며, 수정·삭제는 권한 확인 후 처리하고 관리자 작업 이력을 남깁니다.
기존 신청 데이터는 마이그레이션으로 수정·삭제하지 않습니다. 관리 화면에서 직접 삭제하면 실제 응답이 삭제됩니다.
운영 로그인에는 HTTPS 및 신뢰 프록시 설정이 필요합니다. CSRF 보호와 보안 세션 쿠키를 유지합니다.

추가 기본 테이블:

| 테이블 | 용도 |
|---|---|
| `django_content_type` | 모델 정보 |
| `auth_permission` | 모델별 권한 |
| `auth_group`, `auth_group_permissions` | 그룹 및 그룹 권한 |
| `auth_user`, `auth_user_groups`, `auth_user_user_permissions` | 사용자 및 소속·권한 연결 |
| `django_session` | 로그인 세션 |
| `django_admin_log` | 관리자 작업 이력 |

관리자 테스트는 별도 테스트 DB의 합성 계정·신청 데이터만 사용합니다. 기존 전체 백엔드 테스트 명령에 포함됩니다.

## 프론트엔드 Docker 실행

Docker Desktop 또는 Docker Engine의 Linux 컨테이너 환경이 필요합니다.
프로젝트 루트에서 실행합니다.

```powershell
docker build --pull --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com -t unigate-frontend ./frontend
docker run --rm --name unigate-frontend -p 127.0.0.1:8080:8080 unigate-frontend
```

브라우저에서 `http://localhost:8080/`에 접속합니다. 종료하려면 별도 터미널에서 `docker stop unigate-frontend`를 실행합니다.

이미지는 Node.js 24로 빌드하고 비관리자용 `nginx/nginx-unprivileged:stable-alpine` 이미지로 HTTP 8080에서 정적 파일만 제공합니다.
Nginx 임시 파일과 PID는 `/tmp`에 저장하므로 UID/GID 1000으로도 실행할 수 있습니다.
별도 시작 shell이나 API 프록시는 없습니다. 브라우저가 공개 백엔드 URL로 직접 요청합니다.
`NEXT_PUBLIC_BACKEND_URL`은 빌드 시 정적 JavaScript에 포함되며, 변경 시 재빌드해야 합니다.
런타임 `docker run -e`로는 주소가 바뀌지 않습니다. 로컬 빌드는 환경변수 또는 `frontend/.env.production`을 사용합니다.
Docker는 `.env` 파일을 복사하지 않으므로 반드시 `--build-arg`를 사용하세요.

## 파일 관리

- `frontend/package-lock.json`은 커밋하고 `npm ci`로 의존성을 설치합니다.
- 의존성·빌드 결과·실제 `.env*` 파일은 커밋하지 않습니다. 환경 설정을 공유할 때는 비밀 값 없는 `.example` 파일을 사용합니다.
- 가상환경과 실제 환경 파일은 Git에서 제외합니다. 관리자 정적 파일 수집 결과인 `backend/staticfiles/`도 제외합니다. `backend/media/`는 향후 업로드용 제외 규칙입니다.
- 백엔드 구현이나 폴더 구조가 변경되면 `AGENTS.md`와 이 문서도 함께 갱신합니다.

## 홈페이지 이식 정보

- 원본: https://github.com/jaeminahn/unigate (commit `9b0d606b3605884e2882aa1fe3af31f5dedc9a37`). 원본 라이선스는 `frontend/LICENSE`에 보존했습니다.
- 기본 언어는 인도네시아어이며, 선택한 언어를 브라우저에 저장합니다. 번역은 `frontend/src/lib/i18n/translations.ts`에서 관리합니다.
- 상담 폼은 기존 `POST https://formspree.io/f/meelzwyb`를 유지합니다. 실제 제출은 외부 서비스로 전달됩니다. 해당 상담 폼은 자체 설문 테이블과 연결되지 않습니다. 편입학 정보 신청 모달만 별도 Django API로 저장합니다.
- 원본에 없는 약관·개인정보·환불 페이지와 일부 SNS 목적지는 구현되지 않은 상태입니다. 원본 링크를 유지했으며 별도 콘텐츠가 필요합니다.
- 원본 Google Analytics 추적 코드는 이식하지 않았습니다. Pretendard 폰트는 원본 CDN을 사용하며 로딩 실패 시 시스템 글꼴로 대체합니다.
- 정적 내보내기에는 Next.js 런타임 서버가 필요하지 않습니다. 서버 전용 기능 도입 시 배포 구성을 변경해야 합니다.

## 편입학 정보 신청

4학기 커리큘럼 카드 아래 **편입학 정보 받기** 버튼을 누르면 모달이 열립니다. 이메일·만 나이·소속/학력은 필수이고 희망 대학은 선택입니다. 한국어·영어·인도네시아어를 지원합니다. 신청 성공은 서버 저장 완료 후에만 표시됩니다.

| API | 용도 |
|---|---|
| `GET /api/csrf/` | CSRF 쿠키 및 요청 토큰 발급 (캐시 금지) |
| `POST /api/survey-responses/` | JSON 입력을 검증하고 기존 `survey_responses`에 저장, 성공 시 201 |

POST 필드는 `email`, `age`(숫자 정수 0~120), `education_type`, `desired_university`(선택, 최대 500자)입니다. 희망 대학 미입력은 NULL로 저장합니다. 기존 모델과 스키마는 변경하지 않았고 중복 이메일은 허용합니다. 프론트엔드는 제출 중 재클릭을 막으며, 응답 유실 시 자동 재전송하지 않습니다. PDF는 몇 주 후 이메일로 안내한다고 표시하지만, **PDF 생성·자동 발송·예약 작업은 아직 구현하지 않았습니다.**

### 개발 연결

1. 백엔드 설정 후 `backend/`에서 `.venv\Scripts\python.exe manage.py runserver`를 실행합니다.
2. 별도 터미널의 `frontend/`에서 `npm run dev`를 실행합니다.
3. `http://localhost:3000/`에서 신청하면 브라우저가 `http://localhost:8000`의 백엔드를 직접 호출합니다.

백엔드 주소를 바꾸려면 프론트 실행 전에 `$env:NEXT_PUBLIC_BACKEND_URL="http://localhost:8001"`처럼 지정합니다.
HTTP 개발 환경에서는 localhost와 127.0.0.1을 섞지 말고 두 서비스 모두 같은 호스트명을 사용하세요.

### 정적 배포 / 다른 도메인 연결

프론트 빌드 시 `NEXT_PUBLIC_BACKEND_URL=https://api.example.com`처럼 공개 백엔드 origin을 지정합니다.
경로나 `/api`는 붙이지 않습니다. `out/`는 어떤 정적 호스팅에서도 제공할 수 있으며 프론트에 API 프록시가 필요하지 않습니다.
백엔드의 `DJANGO_ALLOWED_HOSTS`는 백엔드 공개 호스트명, `DJANGO_CSRF_TRUSTED_ORIGINS`는 프론트 공개 origin입니다.
예: 각각 `api.example.com`, `https://www.example.com`. 프론트 origin은 CORS 허용 목록으로도 사용하며 와일드카드는 지원하지 않습니다.
개발/미리보기 포트를 변경하면 해당 origin을 이 목록에 추가하세요.

요청은 `credentials: include`와 CSRF 토큰을 사용합니다. 운영 CSRF 쿠키는 `Secure; SameSite=None`이므로 HTTPS가 필요합니다.
서로 다른 사이트의 쿠키를 차단하는 브라우저에서는 설정이 올바르더라도 제출이 실패할 수 있습니다.
가능하면 `www.example.com`과 `api.example.com`처럼 같은 사이트의 별도 도메인을 사용하고 실제 배포 도메인에서 확인하세요.
참고: [MDN의 credentialed CORS 및 쿠키 제한](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#requests_with_credentials).

검증: 프론트 `npm run lint`, `npm run typecheck`, `npm run build`; 백엔드 `manage.py test surveys config.test_settings config.test_health config.test_cors`.
테스트는 별도 테스트 DB를 사용하며 실제 설문 DB에 테스트 신청을 남기지 않습니다.

## 설문 응답 CSV 내보내기

Linux 또는 Docker 컨테이너에서 실행합니다. Django·프론트엔드 서버를 켤 필요는 없지만 PostgreSQL은 실행 중이어야 합니다.
Docker 이미지에는 실행 권한이 포함됩니다. Linux에 소스를 직접 내려받았다면 최초 한 번 `chmod +x backend/export-surveys`를 실행하세요.

```sh
# backend/ 폴더에서 기본 경로로 내보내기
./export-surveys

# Docker 컨테이너에서는 어느 폴더에서든 실행 가능
/app/backend/export-surveys --output "/tmp/survey responses.csv"

# 기존 CSV 교체를 명시적으로 허용
/app/backend/export-surveys --output "/tmp/survey responses.csv" --overwrite

# 옵션 안내
/app/backend/export-surveys --help
```

실행 파일은 자신의 위치를 기준으로 `manage.py`를 찾습니다. `backend/.venv/bin/python`이 있으면 사용하고, 없으면 PATH의 `python3`를 사용합니다. Docker에는 필요한 Python과 패키지가 설치되어 있습니다. 실행한 폴더는 바꾸지 않습니다.
Windows 로컬에서는 `backend/`에서 다음 명령을 사용합니다.

```powershell
.\.venv\Scripts\python.exe manage.py export_surveys
```

Docker의 기본 출력 경로는 `/app/exports/`입니다. 파일은 컨테이너 안에 생성되므로 필요한 파일을 컨테이너 교체 전에 외부로 복사하세요. PC로 자동 다운로드되지는 않습니다.

기본 경로는 항상 프로젝트 루트의 `exports/survey_responses_날짜_시간.csv`입니다. `--output`의 상대 경로는 명령을 실행한 현재 폴더 기준이며, 없는 상위 폴더는 생성합니다. 출력 파일 확장자는 `.csv`여야 합니다. 같은 파일이 있으면 기본적으로 중단하며, `--overwrite`를 지정한 경우에도 내보내기가 끝난 뒤에만 기존 파일을 교체합니다. 성공 시 파일 경로와 건수만 출력하고, 실패 시 0이 아닌 종료 코드를 반환합니다.

CSV는 Excel에서 한글을 읽을 수 있도록 **UTF-8 BOM**으로 저장합니다. 헤더와 순서는 `id,email,age,education_type,desired_university,created_at`이며, ID 오름차순으로 전체 응답을 내보냅니다. 중복 이메일도 별도 행으로 유지합니다. 소속은 기존 코드값, 희망 대학 미입력은 빈칸, 생성 시각은 `2026-10-31T03:00:00+09:00`처럼 한국 시간과 시간대 정보를 기록합니다.

수식으로 해석될 수 있는 사용자 입력 앞에는 작은따옴표(`'`)를 붙이고 CSV 따옴표·쉼표·줄바꿈을 처리합니다. 이는 스프레드시트 열람용 처리이며 DB 원문은 변경하지 않습니다. Excel 등에서 CSV를 다시 저장·불러오면 이 처리가 달라질 수 있으므로 원문 백업으로 사용하지 마세요. 파일에는 개인정보가 포함됩니다. 기본 `exports/`는 Git에서 제외되지만, 별도로 지정한 경로의 파일은 직접 관리해야 합니다.

`DJANGO_ENV`와 환경 파일 선택 규칙은 서버 실행 때와 같습니다. 새 테이블·API·워커나 추가 라이브러리는 사용하지 않습니다. 내부 명령은 `backend/`에서 `.venv\Scripts\python.exe manage.py export_surveys`로 직접 실행할 수도 있습니다.

내보내기 테스트는 `backend/`에서 실행합니다. Linux 실행 파일 테스트는 Linux 컨테이너에서 `python manage.py test surveys.test_export`로 실행합니다. Windows에서는 해당 실행 파일 테스트만 건너뜁니다.

```powershell
.\.venv\Scripts\python.exe manage.py test surveys.test_export
```

테스트는 별도 DB와 임시 CSV를 사용하며 실제 신청 데이터를 내보내거나 수정하지 않습니다.


## Cloudtype 프론트·백엔드 분리 배포

프론트와 백엔드를 별도 공개 도메인의 Dockerfile 서비스로 배포합니다. 각각 `frontend/`, `backend/`를 빌드 컨텍스트로 지정합니다. 루트 Dockerfile은 없습니다.

```text
브라우저 → 프론트 공개 도메인 → Nginx :8080 (정적 파일)
브라우저 → 백엔드 공개 도메인 → Gunicorn :8000 → PostgreSQL 서비스
```

프론트 Nginx는 API 요청을 전달하지 않습니다. 브라우저가 빌드 시 지정한 백엔드 URL을 직접 호출하며, 백엔드는 허용된 프론트 origin에 CORS 응답을 제공합니다. CSRF 보호는 유지합니다.

### 백엔드 서비스 먼저 설정

| 항목 | 설정 |
|---|---|
| 템플릿 / 소스 디렉터리 | Dockerfile / `backend` |
| Dockerfile | 해당 디렉터리의 `Dockerfile` |
| 서비스 포트 | 8000, 백엔드 전용 공개 HTTPS ingress로 연결 |
| 공개 접근 | 브라우저가 접근 가능한 별도 HTTPS 도메인 |
| UID / GID | 1000 / 1000 |
| 레플리카 / 배포 방식 | 1 / Recreate |
| Health Check | `/api/health/` |
| 시작 명령 | 이미지 기본값 사용 |

먼저 같은 프로젝트·배포환경에 PostgreSQL 서비스를 생성합니다. DB 서비스의 연결 정보에서 내부 호스트와 포트를 확인하고 백엔드 환경 변수에 등록합니다. 백엔드 컨테이너에는 데이터 디스크를 연결하지 않습니다. DB 서비스의 볼륨을 유지하고 서비스를 삭제하지 마세요.

| 백엔드 환경 변수 | 값 |
|---|---|
| `DJANGO_ENV` | `production` (이미지 기본값) |
| `DJANGO_SECRET_KEY` | 고정 운영 키, 런타임 시크릿으로 등록 |
| `DJANGO_ALLOWED_HOSTS` | 백엔드 공개 호스트명, 필요 시 상태 검사에 사용되는 정확한 호스트명 추가 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://프론트공개호스트명` |
| `DJANGO_TRUST_PROXY` | 신뢰된 플랫폼 ingress가 전달 헤더를 교체하는 경우에만 `1` |
| `DJANGO_SSL_REDIRECT` | `1` |
| `DJANGO_SSL_HOST` | 백엔드 공개 호스트명 |

이미지에는 dotenv 파일을 포함하지 않고 프로세스 환경 변수를 사용합니다. 백엔드 공개 도메인은 플랫폼 HTTPS ingress로 연결하세요. 전달 헤더를 신뢰할 때는 ingress를 우회한 프로세스 직접 접근을 차단하세요. 플랫폼 상태 검사 Host가 허용 목록에 없다면 400을 반환하므로 정확한 호스트를 확인해 추가합니다. `/api/health/`는 HTTP 리다이렉트 예외입니다.

추가 PostgreSQL 환경 변수:

| 변수 | 값 |
|---|---|
| `DB_NAME` | 생성한 DB 이름 |
| `DB_USER` | DB 사용자 |
| `DB_PASSWORD` | 런타임 시크릿으로 등록한 비밀번호 |
| `DB_HOST` | PostgreSQL 내부 호스트 |
| `DB_PORT` | PostgreSQL 연결 포트 (보통 5432) |
| `DB_SSLMODE` | 서버의 TLS 정책에 맞게 설정; 기본 `prefer`, TLS 필수 연결은 `require` |

백엔드는 `deploy/start.sh`에서 `python manage.py migrate --noinput` → `python manage.py collectstatic --noinput` → Gunicorn 순서로 시작합니다. 관리자 CSS·JS는 WhiteNoise가 같은 백엔드 도메인의 `/static/`에서 제공합니다.
마이그레이션이나 정적 파일 수집에 실패하면 서버를 시작하지 않습니다. `exec`로 Gunicorn을 실행하여 컨테이너 종료 신호를 직접 전달합니다.
기존 인증·관리자·세션 테이블을 삭제하거나 초기화하지 않습니다. 레플리카 1과 Recreate를 유지합니다.
마이그레이션 전 DB 백업은 운영자가 별도로 수행해야 합니다. 자동 파일 백업은 없습니다.

### 프론트 서비스 설정

| 항목 | 설정 |
|---|---|
| 템플릿 / 소스 디렉터리 | Dockerfile / `frontend` |
| 공개 HTTP 포트 | 8080 |
| Health Check | `/` (프론트 자체 상태) |
| 시작 명령 | 이미지 기본값 사용 |
| 빌드 인자 `NEXT_PUBLIC_BACKEND_URL` | `https://실제백엔드공개호스트` |

Dockerfile path는 `Dockerfile`, Dockerfile text는 빈칸으로 둡니다. Start commands를 명시할 경우 `nginx -g 'daemon off;'`를 사용하세요. 프론트도 UID/GID 1000으로 실행할 수 있습니다.

브라우저에서 접근 가능한 백엔드 공개 HTTPS 주소를 빌드 인자로 전달하세요. 런타임 환경변수만 등록하면 정적 파일에 반영되지 않습니다.
플랫폼에서 Docker 빌드 인자를 전달하는 방법을 확인하거나, 해당 인자로 미리 빌드한 이미지를 배포하세요.
두 서비스 모두 HTTPS 및 HTTP→HTTPS 전환을 설정합니다. 프론트에는 Django 비밀 키나 DB 접속 정보를 연결하지 않습니다.
백엔드 상태는 백엔드 도메인의 `/api/health/`에서 확인합니다.

프론트 재배포는 백엔드 마이그레이션·DB에 영향을 주지 않습니다. 백엔드 재배포에도 동일한 PostgreSQL 서비스와 DB를 사용합니다.

### 백업과 복구

PostgreSQL의 `pg_dump -Fc`로 백업하고 `pg_restore`로 복원합니다. 연결 정보는 환경 변수 또는 접근 제한된 암호 파일로 전달하고 비밀번호를 명령줄·로그에 출력하지 않습니다.
완성된 백업은 접근이 제한된 외부 저장소에 복사하고 보존 기간을 관리하세요. 개인정보가 포함되므로 Git이나 공개 링크에 올리지 않습니다.
복원은 먼저 별도 빈 DB에서 검증합니다. 운영 복구 시 쓰기를 중단하고 현재 DB도 백업한 후 검증한 DB로 전환합니다.
Cloudtype 코드 롤백은 DB를 자동 복원하지 않습니다. 기존 DB를 지우거나 덮어쓰는 복원은 별도 승인이 필요합니다.

### 로컬 배포 검증

프로젝트 루트에서 실행합니다.

```powershell
docker build -t unigate-backend-test backend
docker build --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com -t unigate-frontend-test frontend
```

이미지 빌드 후 별도 PostgreSQL 테스트 DB에 연결하여 두 서비스를 실행해 홈페이지, CSRF 제출, 각각의 재배포 후 연결과 데이터 보존을 확인하세요. 실제 로컬/운영 DB는 테스트에 사용하지 않습니다.

실제 Cloudtype에서도 별도 검증 환경에서 저장→재배포→동일 응답 확인을 완료한 뒤 운영하세요. 외부 백업·보존 기간·복원 훈련은 별도로 운영해야 합니다. HSTS는 전체 공개 도메인의 HTTPS를 확인한 후 플랫폼 또는 프론트 Nginx에서 적용할 정책을 결정하세요. 현재 Django `check --deploy`에서는 HSTS 미설정 경고가 남습니다.
