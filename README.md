# UNIGATE

한국 대학 편입 안내 PDF 신청을 받는 인도네시아어 프로모션 랜딩페이지입니다.
단일 페이지에서 안내 콘텐츠, 비용 비교, 대학 갤러리와 통계 팝업을 제공하고, PDF 신청 정보를 PostgreSQL에 저장합니다.
PDF 파일은 운영자가 나중에 수동으로 보냅니다. 이 랜딩페이지에는 자동 다운로드·메일 발송·회원가입·이용자 로그인·결제·백그라운드 작업이 없습니다. 별도 TOPIQ의 인증 기능은 공유 백엔드에 유지합니다.

## 구성

- 프론트엔드: Node.js 24, npm, Next.js 16, React 19, TypeScript, 일반 CSS. `frontend/out/`으로 정적 내보내기합니다.
- 백엔드: Python 3.13, Django 5.2, Psycopg 3, PostgreSQL 16 기준. 신청 저장, 관리자, CSV 내보내기, 상태 검사 및 기존 TOPIQ 인증을 제공합니다.
- 배포: 프론트 Nginx HTTP 8080, 백엔드 Gunicorn HTTP 8000을 별도 서비스로 실행합니다. 공개 HTTPS는 배포 플랫폼에서 처리합니다.
- 정확한 패키지 버전은 `frontend/package-lock.json`, `backend/requirements*.txt`를 따릅니다.

```text
frontend/
  src/app/page.tsx                   # 모든 랜딩페이지 섹션과 통계 팝업
  src/app/layout.tsx                 # 문서 언어와 공통 CSS
  src/styles/index.css              # 반응형 디자인과 CSS 애니메이션
  src/components/LandingEffects.tsx # 배경 입자, 캐릭터, 스크롤과 갤러리 동작
  src/components/TransferRequest/   # PDF 신청 폼과 제출 상태
  src/lib/landing/                  # 대학 데이터와 팝업 애니메이션
  src/lib/survey.ts                 # 신청 항목 코드와 인도네시아어 문구
  public/landing/                   # 배경·대학 이미지 11개
  scripts/preview.mjs               # 정적 빌드 미리보기
  Dockerfile / nginx.conf
backend/
  surveys/                         # 기존 신청 모델·API·관리자·CSV·테스트
  config/                          # 설정·라우팅·CORS·상태 검사
  accounts/                        # 기존 TOPIQ 인증·이메일 인증·DB 기반 시도 제한
  migration/                       # 기존 DB 마이그레이션
  deploy/                          # 컨테이너 시작과 Gunicorn 설정
  manage.py / export-surveys
  Dockerfile / requirements*.txt
frontend-TOPIQ/                     # 별도 프로젝트; 랜딩페이지 빌드·배포에서 제외
```

`frontend-TOPIQ/`는 수정하거나 정리하지 않습니다. 공유 백엔드의 TOPIQ 인증·로그인 제한과 원격의 최신 TOPIQ 화면 변경을 유지합니다.
디자인·이미지·애니메이션은 위 프론트 소스에 통합되어 있으며 별도 HTML 원본 파일이 필요하지 않습니다.
대학 이미지의 출처·저작자·라이선스는 각 카드에 유지합니다. Google Fonts에서 Manrope를 불러오며, 실패하면 Arial/sans-serif로 표시합니다.

## 로컬 실행

### 프론트엔드

```sh
cd frontend
npm ci
npm run dev
```

`http://localhost:3000`으로 접속합니다. 화면만 확인할 때는 백엔드가 없어도 되지만 신청 저장에는 백엔드가 필요합니다.
개발 백엔드 기본 주소는 `http://localhost:8000`입니다. 변경하려면 `NEXT_PUBLIC_BACKEND_URL`을 HTTP(S) origin으로 지정합니다. `/api` 등 경로를 붙이지 않습니다.

### 백엔드

Python 3.13과 PostgreSQL을 준비하고 `backend/.env.development.example`을 `backend/.env.development`로 복사합니다.
개발 전용 비밀 키와 DB 연결값을 채웁니다. 실제 환경 파일은 Git에 넣지 않습니다.

macOS/Linux:

```sh
cd backend
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver
```

Windows PowerShell에서는 `py -3.13 -m venv .venv`로 환경을 만들고 위 `.venv/bin/python`을 `.\.venv\Scripts\python.exe`로 바꿉니다.
`http://localhost:8000`으로 실행됩니다. 브라우저와 백엔드 주소에 `localhost`와 `127.0.0.1`을 섞지 마세요.

`DJANGO_ENV`는 기본 `development`이며 `.env.development`만 읽습니다. 운영은 프로세스에 `DJANGO_ENV=production`을 지정하고 `.env.production` 또는 플랫폼 환경변수를 사용합니다.
프로세스 환경변수가 파일보다 우선하며, 일반 `.env`는 읽지 않습니다. Docker에서는 환경 파일을 복사하지 않고 런타임 환경변수만 사용합니다.

## 신청과 데이터

페이지 상단·안내 목록·하단의 무료 PDF 안내 버튼으로 동일한 신청 모달을 엽니다.

| 필드 | 규칙 |
|---|---|
| `email` | 필수 이메일, 최대 254자 |
| `age` | 필수 정수, 0~120 |
| `education_type` | 필수, 기존 교육기관 유형 중 선택 |
| `desired_university` | 선택, 최대 500자, 미입력은 NULL |

`survey_responses`의 기존 스키마를 사용합니다. `id`와 `created_at`은 서버가 생성하며 중복 이메일은 별도 신청으로 허용합니다.
프론트는 제출 중 입력·닫기·재제출을 막고, 서버의 201 응답을 받은 뒤에만 완료를 표시합니다. 입력 오류나 실패 시 내용을 유지합니다.
응답 유실·서버 오류는 이미 저장되었을 가능성을 안내하며 자동 재전송하지 않습니다.

Google Analytics 4 측정 ID `G-S2TDPYEQ93`을 랜딩페이지에 삽입했습니다. 기본 페이지 조회 외에 `guide_open`(버튼 위치 `hero`/`contents`/`footer`), `guide_submit`, `guide_submit_failed`(오류 유형), `generate_lead`(신청 API의 201 응답), `university_stats_open` 이벤트를 전송합니다. 신청자의 이메일·나이·학교명과 입력값은 이벤트에 포함하지 않습니다. 운영 반영은 프론트엔드 재빌드·배포 후 확인합니다.

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/csrf/` | CSRF 쿠키와 토큰 발급 |
| POST | `/api/survey-responses/` | 입력 검증 후 신청 저장, 성공 201 |
| GET | `/api/health/` | 신청 테이블 접근 가능 여부, 200 또는 503 |

`/api/auth/*`는 기존 TOPIQ가 사용하는 인증 API이며 랜딩페이지에서는 호출하지 않습니다. `/admin/`은 운영자용 Django 관리자입니다.
관리자 로그인에 필요한 Django 기본 인증·권한·세션 앱은 유지합니다.
`accounts` 앱은 TOPIQ의 가입·로그인·이메일 인증과 PostgreSQL 기반 시도 제한을 제공합니다. 기존 이메일 고유 인덱스 및 마이그레이션 이력을 유지합니다.
기존 모델·마이그레이션·테이블을 삭제하거나 초기화하지 않습니다.

### 관리자와 수동 발송

백엔드에서 `manage.py createsuperuser`로 운영자 계정을 대화형으로 만든 후 백엔드 도메인의 `/admin/`에 접속합니다.
신청 목록을 검색·필터링하고 관리자의 **CSV 다운로드** 버튼으로 현재 필터에 맞는 전체 신청을 내려받아 PDF를 수동 발송합니다. CSV 다운로드는 신청 조회 권한이 있는 운영자만 사용할 수 있습니다. 관리자에서 신청을 삭제하면 실제 데이터가 삭제됩니다.
운영자 계정·신청자 개인정보·내보낸 CSV는 Git이나 공개 공유 경로에 올리지 않습니다.

Linux 또는 컨테이너:

```sh
cd backend
./export-surveys
./export-surveys --output /tmp/survey-responses.csv
```

Windows: `backend/`에서 `.\.venv\Scripts\python.exe manage.py export_surveys`를 실행합니다.
기본 출력은 저장소 루트의 `exports/survey_responses_날짜_시간.csv`이며 UTF-8 BOM과 ID 오름차순을 사용합니다.
헤더는 `id,email,age,education_type,desired_university,created_at`입니다. Excel 수식으로 해석될 수 있는 입력은 표시용으로 이스케이프하며 DB 원문은 바꾸지 않습니다.
기존 파일 덮어쓰기는 `--overwrite`를 명시한 경우만 허용합니다. 컨테이너의 CSV는 교체 전에 외부로 복사해야 합니다.

## 빌드와 검증

`frontend/`에서:

```sh
npm ci
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run lint
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run typecheck
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run build
npm run preview
```

PowerShell에서는 먼저 `$env:NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"`을 설정한 뒤 `npm run ...`을 실행합니다.
타입 생성과 빌드에도 백엔드 origin이 필요합니다. `preview`는 기본 `http://127.0.0.1:3000`에서 `out/`만 제공합니다.
미리보기로 신청을 검증할 때는 브라우저에서 `http://localhost:3000`을 사용하거나 프론트·백엔드 호스트명을 함께 맞춥니다.

격리된 PostgreSQL 테스트 환경을 지정한 후 `backend/`에서:

```sh
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test accounts surveys config.test_settings config.test_health config.test_cors config.test_routes --noinput
```

테스트는 합성 데이터와 `test_<DB_NAME>`을 사용하며 테스트 계정에는 CREATEDB 권한이 필요합니다. 운영 DB 연결 설정으로 실행하지 않습니다.
환경 설정 파싱 테스트만 실행하려면 `.venv/bin/python -m unittest config.test_settings`를 사용합니다.

## 공유 백엔드의 TOPIQ 인증

`frontend-TOPIQ/`의 코드는 원격 최신 상태 그대로 유지합니다. TOPIQ의 Next.js 서버가 `DJANGO_BACKEND_URL`로 공유 Django를 호출하며, 랜딩페이지의 정적 빌드와는 별개입니다.

| 메서드 | 기존 경로 | 목적 |
|---|---|---|
| POST | `/api/auth/email/send/` | Brevo 이메일 인증 발송·재발송 |
| POST | `/api/auth/email/verify/` | 서명된 인증 토큰 검증 |
| POST | `/api/auth/signup/` | 이메일 인증 후 가입·로그인 |
| POST | `/api/auth/login/` | 이메일·비밀번호 로그인 |
| POST | `/api/auth/logout/` | 세션 종료 |
| GET | `/api/auth/me/` | 현재 회원 조회 |

CSRF·세션 쿠키·사용자 테이블과 기존 `accounts_rate_limit` 테이블을 유지합니다. 로그인·가입·메일 발송의 시도 제한은 PostgreSQL에 저장하며 서버 재시작 후에도 유지됩니다. 제한 저장소 오류는 503으로 응답합니다.
이 테이블과 `migration/accounts/0002_rate_limit.py`는 기존 원격 변경이며 이번 랜딩페이지 변경에서 새로 추가한 것이 아닙니다.
운영자가 `manage.py cleanup_auth_rate_limits --batch-size 1000`을 실행하면 만료된 제한 기록만 정리합니다. 자동 워커는 없습니다.

TOPIQ 이메일 인증에는 백엔드 런타임에 `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `TOPIQ_PUBLIC_URL`을 설정합니다. 키는 프론트엔드에 전달하지 않습니다.
`DJANGO_CSRF_TRUSTED_ORIGINS`에는 랜딩페이지와 TOPIQ의 정확한 origin을 함께 등록합니다. 테스트에서는 메일 전송을 모킹하고 실제 메일을 발송하지 않습니다.

## Docker / Cloudtype 배포

빌드 컨텍스트는 각각 `frontend/`와 `backend/`입니다. `frontend-TOPIQ/`는 포함하지 않습니다.

```sh
docker build --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com -t unigate-frontend ./frontend
docker build -t unigate-backend ./backend
```

| 서비스 | 포트 | 상태 검사 | 설정 |
|---|---|---|---|
| 프론트 | 8080 | `/` | 빌드 인자 `NEXT_PUBLIC_BACKEND_URL` |
| 백엔드 | 8000 | `/api/health/` | 아래 런타임 환경변수 |

프론트는 비관리자 Nginx로 정적 파일을 제공하고 API를 프록시하지 않습니다. 브라우저가 백엔드 공개 주소로 직접 요청합니다.
`NEXT_PUBLIC_BACKEND_URL`은 **빌드 시** JavaScript에 포함됩니다. 런타임 환경변수만 바꿔서는 반영되지 않으며 재빌드가 필요합니다.
이전 홈페이지 경로 `/tentang-kami`, `/kurikulum`, `/institusi-mitra`, `/contact`는 `/`로 이동합니다.

백엔드 필수/선택 설정:

| 변수 | 값과 용도 |
|---|---|
| `DJANGO_ENV` | 운영은 `production` (이미지 기본값) |
| `DJANGO_SECRET_KEY` | 지속적인 운영 키, 플랫폼 시크릿으로 관리 |
| `DJANGO_ALLOWED_HOSTS` | 백엔드 공개 호스트명, 쉼표 구분, 와일드카드 금지 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 프론트 공개 HTTPS origin, CORS 허용 목록도 겸함 |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | 기존 PostgreSQL 연결값 |
| `DB_SSLMODE` | DB TLS 정책에 맞게 지정; 기본 `prefer` |
| `DJANGO_TRUST_PROXY` | ingress가 전달 헤더를 교체하고 직접 접근을 차단할 때만 `1` |
| `DJANGO_SSL_REDIRECT` | 운영 HTTPS 전환 시 `1` |
| `DJANGO_SSL_HOST` | HTTPS 전환 대상 백엔드 호스트명 |

프론트·백엔드 모두 공개 HTTPS를 설정합니다. CORS origin에는 경로·끝 슬래시·와일드카드를 넣지 않습니다. `https://unigate.kr` 또는 `https://www.unigate.kr` 중 하나를 명시하면 두 공식 랜딩 주소를 CSRF·CORS에 함께 허용합니다. 다른 도메인이나 서브도메인은 자동으로 추가하지 않습니다.
쿠키와 `X-CSRFToken`을 함께 사용하며 운영 CSRF 쿠키는 `Secure; SameSite=None`입니다.
브라우저의 교차 사이트 쿠키 제한을 줄이려면 같은 사이트의 서브도메인(예: `www.example.com`, `api.example.com`)을 사용하고 실제 배포 도메인에서 확인하세요.

백엔드는 `migrate --noinput` → `collectstatic --noinput` → Gunicorn 순서로 시작합니다. 관리자의 정적 파일은 WhiteNoise가 제공합니다.
기존 배포의 단일 레플리카 / Recreate 구성을 유지하고, 동일한 PostgreSQL 서비스·볼륨·연결값을 사용합니다.
마이그레이션 전 백업은 운영자가 별도로 수행합니다. 코드 교체가 DB 백업이나 복원을 대신하지 않습니다.
DB 비밀번호·이메일 발송 키를 프론트 빌드 인자에 넣지 않습니다. 랜딩페이지 신청에는 Brevo가 필요 없지만 TOPIQ 이메일 인증에는 앞 절의 Brevo 설정이 필요합니다.

배포 후 별도 검증 환경에서 HTTPS, 상태 검사, CSRF를 포함한 신청 저장, 관리자 조회와 CSV 내보내기를 확인하세요.
Docker 실행 환경이나 운영 도메인에서 확인하지 못한 항목은 로컬 코드 검사 통과만으로 검증된 것으로 취급하지 않습니다.

## 배포 전 검증 기록 (2026-11-02)

- Chromium에서 360, 390, 650, 768, 900, 1024, 1440, 1920px 폭을 비교했습니다. 신청 폼을 제외한 346개 요소의 위치·크기와 주요 계산 스타일은 기준 디자인과 일치했습니다.
- 배경·대학 이미지 11개는 기준 이미지와 바이트 단위로 일치합니다.
- 동일한 뷰포트·난수·시간 조건에서 캐릭터의 20프레임 변형값과 배경 캔버스 픽셀이 일치했습니다. CSS 애니메이션 6개의 키프레임과 재생 설정도 일치했습니다.
- 정지 화면 비교는 무작위 배경 입자를 숨긴 조건입니다. 1440×1000 화면은 픽셀이 일치했고, 390×844 화면은 일부 픽셀에 RGB 1 이내의 차이가 있었습니다. 모든 기기·브라우저의 픽셀 동일성을 보장하는 검사는 아닙니다.
- 의도된 차이는 기존 신청 폼 항목·저장 동작과 651~900px에서 화면 밖으로 나가는 캐릭터 장식의 가로 넘침 보정입니다. 이 보정은 섹션 배치와 크기를 변경하지 않습니다.
- 랜딩페이지 검증에서 PostgreSQL 16과 Python 3.13의 배포 컨테이너로 테스트 43개와 브라우저→Nginx→Gunicorn→DB의 합성 신청 저장을 확인했습니다. 최신 원격 통합 후에는 TOPIQ 인증·시도 제한·관리자 CSV 및 공식 랜딩 도메인 CORS 회귀 테스트를 포함한 전체 97개 검사가 통과했습니다.
- 검증은 로컬 격리 환경에서 수행했습니다. 운영 HTTPS·도메인·쿠키 정책과 플랫폼 설정은 실제 배포 환경에서 별도로 확인해야 합니다.

## Hub 문제은행 연결

`backend/question_bank/`는 Hub가 직접 전송한 `topik_bank` 스키마의 5개 테이블을 조회합니다.
대상은 `question_sets`, `items`, `tts_audio_assets`, `item_audio_bindings`, `item_visual_assets`입니다.
Django의 기존 기본 PostgreSQL 연결을 사용하며, 모든 모델은 `managed=False`입니다.
문제은행의 최초 초기화와 문제 데이터 전송은 Hub의 **서버에 문제 등록** 화면이 담당합니다.
이후 소비 DB 구조 변경은 `backend/migration/question_bank/*.py`의 Django migration으로 관리합니다.
모델의 `managed=False`는 유지하며, 필요한 DB 변경은 명시적인 migration 작업으로 적용합니다.
기존 대상 DB의 구조가 다르면 Hub는 전송을 중단하며 자동 갱신하지 않습니다.
수신 HTTP API, 역방향 전송, Django 관리자 편집 기능은 추가하지 않습니다.
`managed=False`는 스키마 관리 설정이며 자체적으로 DB 쓰기 권한을 제한하지는 않습니다.

Hub의 `QUESTION_BANK_LOCAL_DATABASE_URL`은 이 백엔드의 개발 DB와 같은 DB를,
`QUESTION_BANK_PRODUCTION_DATABASE_URL`은 운영 DB를 가리키게 설정합니다.
Hub의 원본 `DATABASE_URL`과는 다른 DB여야 합니다. 실제 연결값은 환경 파일에만 보관합니다.
`topik_bank.schema_migrations`와 Hub 배포 이력은 복사하지 않으며 기존 Django 테이블은 유지합니다.
S3·CloudFront 미디어 주소는 원본과 공유합니다.

현재 소비 스키마는 Hub `011_item_audio_only` 기준입니다. `010_exam_format`에서 추가한 `items`와 `question_sets`의 `exam_format`은
`pbt` 또는 `ibt`이며 기본값은 `pbt`입니다. 세트 고유키는 시험 방식을 포함하고,
문항과 소속 세트의 시험 방식은 복합 외래키로 일치시킵니다. IBT 문항 슬롯·세트 위치는 1~30입니다.

`0002_exam_format.py`는 모델 상태를 기록하고, `0003_apply_exam_format_schema.py`는 기존 소비 DB의
컬럼·제약조건·인덱스·뷰를 갱신합니다. 기존 문항은 `pbt`로 유지하며 UUID·미디어 연결·응시 기록을 보존합니다.
`0003`은 기존 6개 테이블과 음원 통합 후의 5개 테이블 모두 지원합니다.

`0004_item_audio_only.py`는 기존 `question_set_item_audio_bindings`의 전체 이력을 `item_audio_bindings`로
옮기고 검증한 뒤 기존 세트 연결 테이블을 제거합니다. 기존 문항·세트·음원·이미지와 PBT 응시 스냅샷은 변경하지 않습니다.
연결 PK는 `binding_id` UUID이며, 이전 연결에서 생성하는 UUID는 Hub 011과 같은 결정적 규칙을 사용합니다.
기존 문항 연결의 해시·음원·생성 시각을 보존하고, 세트 연결의 원래 위치는 `origin_set_id`·`origin_position`에 기록합니다.
현재 유효한 세트 연결을 우선 유지하고, 없으면 현재 문항 해시와 일치하는 삭제되지 않은 문항 음원을 유지합니다.
과거 세트 연결의 알 수 없는 해시는 `NULL`로 보존하며, 현재 연결은 해시가 필수이고 문항당 최대 하나입니다.
PBT는 `item_id`로 현재 연결을 조회하고 문항 해시 일치·음원 미삭제 여부를 확인합니다. 이관 출처의 위치로 음원을 찾지 않습니다.

이미 Hub 011로 전환된 DB에서는 `0004`가 컬럼·PK·FK·CHECK 제약·인덱스를 검증하고 Django 모델 상태와 적용 이력만 기록합니다.
기존 음원 연결을 다시 이관하거나 UUID를 재생성하지 않습니다. 적용 이력은 `django_migrations`로 관리합니다.
문제은행 테이블이 전혀 없는 DB에서는 구조 갱신을 건너뛰고 Hub가 현재 스키마로 최초 초기화합니다.
일부 테이블만 있거나 구형·신형 음원 컬럼이 섞인 DB는 오류로 중단합니다. 소비 DB에 Hub의 마이그레이션·배포 이력 테이블을 만들지 않습니다.

구형 DB 적용 전에는 대상 DB의 전체 백업과 복원 가능 여부를 확인하고, Hub 전송·음원 편집 및 웹 요청을 중지합니다.
`0004`는 관련 테이블 쓰기를 잠그고 이관·이력 검증·테이블 제거를 하나의 트랜잭션으로 수행합니다.
문항 없는 연결, 이력 검증 실패 또는 제거 대상 테이블을 참조하는 외부 객체가 있으면 전체 이관을 롤백합니다.
자동 백업이나 역방향 migration은 제공하지 않으며, 적용 후 이전 구조로 돌아가려면 적용 전 백업을 복원해야 합니다.

로컬에서는 사용자가 백업을 확인한 뒤 아래 명령을 `backend/`에서 수동 실행합니다.
`migrate`는 구형 DB의 구조·음원 연결 데이터를 변경하며, 이미 전환된 DB에서는 검증과 Django 적용 이력 기록만 수행합니다.
뒤의 두 점검 명령은 DB를 변경하지 않습니다. 최초 빈 DB에서는 `migrate` 후 Hub 초기화·전송을 완료하고 점검합니다.

```powershell
cd backend
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py inspect_question_bank
.\.venv\Scripts\python.exe manage.py sync_exams --check
```

점검 후 `python manage.py runserver`로 시작합니다. `runserver`에는 자동 마이그레이션을 추가하지 않습니다.
운영에서는 기존 `deploy/start.sh`가 `migrate --noinput` 후 Gunicorn을 시작합니다.
운영 배포 전에도 같은 백업·쓰기 중지 절차가 필요합니다. 신규 HTTP API·영구 테이블·백그라운드 작업은 없습니다.
별도 SQL 파일이나 수동 SQL 실행은 사용하지 않습니다.

로컬에서 읽기 전용 연결 검증:

```powershell
cd backend
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py inspect_question_bank
.\.venv\Scripts\python.exe manage.py inspect_question_bank --set-id 세트_UUID
```

명령은 테이블별 건수와 시험 방식·세트별 문항 수를 출력하며 연결·미디어 모델 매핑을 조회합니다.
문항 내용·정답·연결 비밀번호는 출력하지 않습니다. 문제은행이 아직 초기화되지 않았다면 오류로 안내합니다.
일반 백엔드 검증에 `question_bank` 테스트를 포함합니다. 테스트는 로컬의 격리된 테스트 DB에서만 실행합니다.
`backend/`에서 `.\.venv\Scripts\python.exe manage.py test question_bank pbt --noinput`으로 실행합니다.
테스트 러너는 별도 테스트 DB를 생성·제거합니다. 구형 이관·이미 전환된 DB·빈 DB·불완전한 스키마,
음원 이력과 응시 기록 보존·실패 시 전체 롤백·현재 음원 조회를 검증합니다.

## PBT·IBT 모의고사

`frontend-TOPIQ`의 `/pbt`, `/ibt`에서 듣기·읽기와 연습·실전 모드를 각각 선택합니다.
두 시험은 목록·응시·저장·채점·결과 화면을 공유하고 시험 방식별 규칙을 적용합니다. 쓰기는 포함하지 않습니다.

| 시험 | 영역별 문항 수 | 점수 | 실전 듣기 | 실전 읽기 |
|---|---|---|---|---|
| PBT | 50 | 문항당 2점, 100점 만점 | 60분 | 70분 |
| IBT | 30 | 정답 수 ÷ 30 × 100, 정수 반올림 | 35분 | 40분 |

연습은 시간 제한이 없습니다. IBT 점수는 학습용 모의고사 환산 점수이며 공식 성적 환산을 제공하지 않습니다.
결과에는 정답 수와 전체 문항 수도 표시합니다. 실전 시간은 서버의 마감 시각을 기준으로 처리합니다.
듣기는 기존 공통 플레이어를 사용합니다. 연습에서는 자유롭게 재생·반복·탐색할 수 있고,
실전에서는 자동 재생 후 재생·일시정지·탐색·반복 조작이 제한되며 음원 종료 후 문항을 이동합니다.
이 재생 제한은 브라우저에서 처리하며, 시험 시간과 답안 마감은 서버에서 검사합니다.

IBT 듣기 1~2번은 그림 선택지, 읽기 4~7번은 자료 이미지를 표시합니다.
듣기 15~30번과 읽기 23~30번은 두 문항씩 공통 음원·지문을 사용합니다.
묶음 정보는 응시 시작 시 스냅샷에 저장하며, 이전 PBT 응시의 기존 묶음 표시도 지원합니다.

회원은 공개된 모든 세트, 비회원은 **시험 방식·영역별 최대 3세트**에 접근합니다.
실제 공개 수는 등록된 완성 세트 수에 따라 달라집니다. `exam_format + section + guest_slot` 고유 제약으로 슬롯 충돌을 막습니다.
목록뿐 아니라 응시 시작과 조회·저장·제출·결과에서도 시험 방식과 소유권을 검사합니다.
PBT 경로로 IBT 시험·응시를 요청하거나 반대로 요청하면 접근할 수 없습니다.
비회원 기록은 기존 Django 세션의 무작위 소유자 UUID를 공유하되 각 시험 목록에는 해당 방식의 기록만 표시합니다.
로그인하면 같은 세션의 비회원 기록을 계속 볼 수 있지만 계정으로 자동 이관되지는 않습니다.
쿠키 삭제·만료·로그아웃 시 비회원 기록에 대한 접근이 사라집니다.

로그인한 사용자의 시험 카드에는 선택한 모드의 최근 제출 점수를 표시합니다.
점수 배지를 누르면 결과로 이동하며, 모드·제출일도 확인할 수 있습니다.
최근 100건 기록과 별도로 전체 기록에서 세트·모드별 최근 점수를 조회하므로 오래된 결과도 표시됩니다.
진행 중 응시가 있으면 이어풀기를 제공하며 재응시 중에도 이전 제출 점수를 유지합니다.

### 마이그레이션과 시험 등록

최초 적용 시 **사용자가 `backend/`에서 수동으로** 아래 순서대로 실행합니다.
로컬 서버를 실행하기 전에 마이그레이션을 적용하세요. 로컬 서버 시작 시 자동 적용하지 않습니다.

```powershell
cd backend
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py sync_exams --check
.\.venv\Scripts\python.exe manage.py sync_exams
```

- `migrate`: `migration/pbt/0002_exam_format.py`를 포함한 미적용 마이그레이션을 적용합니다.
  기존 `pbt_exams`, `pbt_attempts`에 `exam_format`을 추가해 기존 행은 `pbt`로 유지하고 비회원 슬롯 제약을 확장합니다.
  새 테이블은 없으며 기존 응시 ID·점수·문항 스냅샷을 보존합니다. 원본 문제은행은 이 마이그레이션에서 변경하지 않습니다.
- `sync_exams --check`: **PBT·IBT 모두** 검증만 수행하는 읽기 전용 명령입니다. DB 행이나 스키마를 변경하지 않습니다.
- `sync_exams`: **PBT·IBT 모두** 완성된 신규 세트를 시험 목록에 등록·공개합니다. `pbt_exams` 행을 추가하며 스키마나 원본 문제은행을 변경하지 않습니다.
  기존 제목·회차·공개 여부·비회원 슬롯은 보존합니다. 반복 실행해도 같은 세트를 중복 등록하지 않습니다.

선택한 시험만 처리하려면 다음처럼 실행합니다. `--check`와 함께 사용할 수 있습니다.

```powershell
.\.venv\Scripts\python.exe manage.py sync_exams --exam-format pbt
.\.venv\Scripts\python.exe manage.py sync_exams --exam-format ibt
.\.venv\Scripts\python.exe manage.py sync_exams --exam-format ibt --check
```

기존 `sync_pbt_exams` 명령은 `sync_exams`로 변경되었습니다. 기존 수동 실행 명령도 새 이름으로 바꾸세요.
새 Hub 세트를 전송한 뒤에는 등록 명령을 다시 수동 실행합니다. 실행 순서는 PBT와 IBT를 같은 트랜잭션 안에서 차례로 처리합니다.
시험 방식·영역별 생성 시각과 UUID 순으로 회차를 매기고 빈 비회원 슬롯 1~3을 할당합니다.
문항 수·위치·정답·선택지·현재 미디어 해시·묶음 자료를 검증하여 불완전한 세트는 사유와 함께 건너뜁니다.
새 응시 시작 시에도 검증하며 불완전한 세트는 409로 안내합니다. 기존 응시는 저장된 스냅샷으로 조회·재개·채점합니다.
관리자에서는 시험 방식별 필터와 공개 여부·비회원 슬롯 조정을 제공합니다.

운영은 기존 `deploy/start.sh`가 **마이그레이션 → 정적 파일 수집 → Gunicorn**을 자동 실행합니다.
시험 등록은 자동 실행하지 않으므로 배포와 Hub 데이터 전송 이후 운영 환경에서 `python manage.py sync_exams --check`,
`python manage.py sync_exams`를 수동 실행합니다. 별도 백그라운드 워커는 없습니다.

### API와 데이터

기존 테이블 세 개를 공유합니다. 이번 IBT 지원으로 새 테이블은 추가하지 않습니다.

| 테이블 | 목적 |
|---|---|
| `pbt_exams` | 시험 방식, 원본 세트 UUID, 제목·회차, 영역, 공개 여부, 비회원 슬롯 |
| `pbt_attempts` | 응시 시점 시험 방식, 사용자·비회원, 모드, 시작·마감·제출 시각, 상태·점수 |
| `pbt_attempt_items` | 문제·정답·해설·대본·미디어·묶음 스냅샷과 답안·채점 결과 |

기존 `/api/pbt/` API를 유지하며 아래 IBT API를 추가합니다.

| HTTP 메서드 | 경로 | 목적 |
|---|---|---|
| GET | `/api/ibt/exams/` | IBT 시험 목록·접근 가능 여부·회원의 모드별 최근 결과와 진행 중 응시 |
| POST | `/api/ibt/attempts/` | 응시 시작·재개, `restartAttemptId` 지정 시 기존 응시 마감 후 새 응시 시작 |
| GET | `/api/ibt/attempts/` | 본인의 최근 IBT 응시 100개 |
| GET | `/api/ibt/attempts/<id>/` | 본인 응시 상태·문제·저장 답안 |
| PUT | `/api/ibt/attempts/<id>/answers/<position>/` | `selectedOption` 1~4 저장 또는 `null`로 해제 |
| POST | `/api/ibt/attempts/<id>/submit/` | 멱등 제출·채점 |
| GET | `/api/ibt/attempts/<id>/result/` | 제출 후 점수·정답·해설·대본. 비회원 응시는 이메일 링크 인증 필요 |

PBT는 위 경로에서 `ibt`를 `pbt`로 바꾼 동일한 API를 사용합니다.
시작 요청은 `examId`, `mode`를 받으며 선택적으로 `restartAttemptId`(기존 응시 UUID)를 받습니다.
목록의 **풀기 시작**은 같은 세트·같은 모드의 진행 중 응시가 있으면 이 ID를 함께 보내 재시작합니다.
기존 응시는 저장된 답안으로 채점·제출되며 미응답은 오답입니다. 기록과 결과를 보존하고 회원의 최근 점수에도 반영합니다.
새 응시는 빈 답안으로 시작하고 실전 제한 시간도 새로 부여합니다. **이어풀기**는 기존 응시 화면으로 이동합니다.
서버는 본인 계정 또는 현재 비회원 세션 소유의 동일 시험 방식·세트·모드인지 확인합니다.
문제 준비 상태와 요청 제한을 확인한 뒤 기존 응시 마감과 새 응시 생성을 한 트랜잭션에서 처리합니다. 생성 실패 시 기존 응시도 유지합니다.
같은 재시작 요청을 반복하면 현재 진행 중인 응시를 반환하고 추가로 마감하지 않습니다.
대상이 이미 마감되었고 진행 중인 응시도 없으면 `409 attempt_closed`를 반환하므로 목록을 새로 조회한 뒤 시작합니다.
`restartAttemptId`를 생략하면 기존처럼 진행 중 응시를 재개하거나 새 응시를 생성합니다. DB 구조 변경이나 별도 실행 명령은 필요 없습니다.
목록·응시 응답의 `examFormat`은 `pbt` 또는 `ibt`, `maxScore`는 100입니다.
목록의 `questionCount`·`durationSeconds`와 응시 문항 수를 이용해 화면을 표시합니다.
목록의 `myProgress`는 비회원에게 `null`, 회원에게 모드별 `latestResult`와 `inProgressId`를 제공합니다.
문제의 `groupId`가 같으면 공통 지문·음원 묶음입니다. 기존 PBT 스냅샷에는 이 필드가 없을 수 있습니다.
IBT 문항의 `points=1`은 정답 수 집계용 원점수이며 최종 `score`는 100점 환산값입니다.

변경 요청은 CSRF 검사를 수행하고 응답은 `private, no-store`입니다.
제출 전에는 표시 필드만 반환하며 정답·해설·듣기 대본이나 원본 `content_json`을 노출하지 않습니다.
서버 마감 이후 답안 변경은 거절합니다. 열린 화면은 시간 종료 시 제출을 요청하고,
브라우저가 닫혀 있으면 다음 조회·저장·제출 요청에서 마감 시각 기준으로 확정합니다.
답안 저장과 제출은 같은 응시 행을 잠가 중복 채점과 채점 중 답안 변경을 방지합니다.
응시 시작은 시험 방식·소유자별 시간당 30회로 제한합니다.

검증은 `backend/`에서 `.\.venv\Scripts\python.exe manage.py test pbt question_bank --noinput`,
`frontend-TOPIQ/`에서 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`로 실행합니다.
백엔드 테스트는 격리된 PostgreSQL 테스트 DB에 합성 문제를 만들어 시험 방식 분리, 기존 PBT 보존,
마이그레이션, 동기화 옵션, 비회원 제한, 소유권, CSRF, 시간 만료, 저장·채점·스냅샷·미디어를 확인합니다.

### 비회원 결과 이메일·별점·사후 설문

PBT·IBT의 읽기·듣기, 연습·실전에 공통 적용합니다. 비회원 응시는 제출(자동 제출 포함) 후
`/<format>/attempts/<id>/feedback`에서 이메일, 1~5점 별점, 설문과 수집·이용 동의를 입력합니다.
결과 메일의 링크를 열어야 점수·정답·정오답·해설·듣기 대본을 확인할 수 있습니다.
기존 비회원 기록에도 적용하며, 비회원으로 시작한 응시는 이후 로그인해도 이메일 인증이 필요합니다.
회원 계정으로 시작한 응시는 기존처럼 조회합니다. 회원가입 설문은 아래의 별도 가입 흐름에서 수집합니다.

설문은 국적, 출생연도(1950~KST 올해), TOPIK 응시 목적(복수 선택), 기타 목적(선택 시 필수, 500자),
한국어 학습 기간, TOPIK II 응시 경험, 현재 급수(응시 경험이 있으면 0~6), 목표 급수(3~6)를 받습니다.
`0`은 급수 없음이고, 응시 경험이 없으면 현재 급수는 NULL입니다. 별점은 정수만 허용합니다.
설문 선택 코드·번역은 `backend/surveys/survey_catalog.json`과 `frontend-TOPIQ/src/lib/survey-catalog.json`에
동일하게 보관합니다. 두 배포가 독립적이므로 양쪽을 함께 수정하며 계약 테스트로 일치 여부를 검사합니다.
설문·동의 문구를 바꿀 때는 해당 버전도 갱신합니다.

신규 테이블은 **`exam_attempt_feedback` 하나**입니다. 기존 `pbt_attempts`와 1:1로 연결해
이메일·별점·언어, 설문 답변, 최초 설문/동의 버전·시각, 토큰 해시·만료·최초 열람 시각,
메일 상태·요청·접수 시각, 생성·수정 시각을 저장합니다. 이메일 중복은 허용하며 기존 응시는 수정하지 않습니다.
Django 관리자에서 시험 방식·영역·별점·언어·메일 상태로 필터링하고 이메일로 검색할 수 있습니다.
관리 화면은 조회 전용이고 토큰 해시는 표시하지 않습니다. 개인정보 조회는 해당 모델 조회 권한이 있는 관리자만 가능합니다.

신규 API (`<format>`은 `pbt` 또는 `ibt`):

| 메서드 | 경로 | 목적 |
|---|---|---|
| POST | `/api/<format>/attempts/<id>/result-email/` | 해당 응시 소유 세션에서 입력 저장 및 결과 메일 발송·재발송 |
| POST | `/api/<format>/result-access/` | `attemptId`, `token` 검증 후 현재 브라우저에 해당 결과 조회 권한 부여 |

첫 발송은 `email`, `rating`, `language`(`ko`/`en`/`id`), `survey`를 받습니다.
`survey` 키는 `nationalityCode`, `birthYear`, `topikReasons`, `topikReasonOther`, `koreanStudyDuration`,
`topikExperience`, `currentTopikLevel`, `targetTopikLevel`, `privacyConsent`(true), `privacyConsentVersion`입니다.
현재 동의 버전은 `topiq_exam_privacy_v1`입니다. 재발송은 `survey`를 생략할 수 있으며,
기존 설문과 동의 시각을 덮어쓰지 않습니다. 응시 상세·목록·제출 응답은 `guestAttempt`, `resultAccess` 및
비회원의 `feedback` 완료·메일 상태를 제공합니다. 미인증 비회원의 `score`는 NULL입니다.
접근이 잠긴 결과 API는 소유자에게 `403 result_email_required`, 다른 사람에게 404를 반환합니다.

결과 링크는 **7일** 유효하고, 토큰은 URL fragment(`#token=...`)로 전달한 뒤 화면에서 제거합니다.
서버에는 원문을 저장하지 않습니다. 다른 브라우저에서도 링크로 결과만 조회할 수 있으며
응시 상세·답안 수정·재발송 권한은 생기지 않습니다. 열람 권한도 링크 만료 시 함께 끝납니다.
재발송할 때 새 토큰으로 교체하므로 **기존 링크와 그 링크로 얻은 조회 권한은 만료**됩니다.
재발송은 최초 응시 브라우저 세션이 필요합니다. 쿠키 삭제·로그아웃으로 소유 세션을 잃으면 재발송할 수 없습니다.

메일은 기존 `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `TOPIQ_PUBLIC_URL` 설정을 사용합니다.
프론트엔드에 키를 전달하지 않습니다. 발송은 요청 안에서 실행하며 별도 작업자·스케줄·실행 명령은 없습니다.
설문과 발송 요청은 메일 호출 전에 커밋하므로 실패해도 설문은 보존됩니다.
`accepted`는 Brevo 접수 완료이며 실제 도착을 보장하지 않습니다. 타임아웃 등 접수 여부가 불명확하면
`uncertain`으로 표시하고 자동 재발송하지 않습니다. 받은 편지함을 확인한 뒤 수동 재시도합니다.
프로세스 중단으로 `sending` 상태가 남아도 재발송 제한 시간이 지나면 수동 재시도할 수 있습니다.
재발송 간격은 60초, 발송 시도는 응시·수신 이메일별 시간당 5회, 요청 IP별 시간당 100회입니다.
링크 검증 요청도 IP별 10분당 100회로 제한합니다. 제한 시 `429`와 `Retry-After`를 반환합니다.
모든 POST는 CSRF 검사, 응답은 `private, no-store`를 사용하고 개인정보·토큰을 로그에 기록하지 않습니다.

**적용:** 코드를 반영한 뒤 새 백엔드를 실행하기 전에 개발자가 `backend/`에서 수동 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py migrate
```

이 명령은 `migration/pbt/0003_exam_attempt_feedback.py`를 포함한 미적용 마이그레이션을 적용하며,
신규 테이블 및 별점·급수 제약을 생성합니다. 에이전트나 개발 서버가 로컬에 자동 적용하지 않습니다.
운영은 기존 `deploy/start.sh`가 마이그레이션 → 정적 파일 수집 → Gunicorn 시작을 자동 수행합니다.
백엔드 적용 후 프론트엔드를 배포합니다. 메일 설정이 없으면 발송 실패로 표시되므로 활성화 전에 설정을 확인합니다.

**검증:** 개발·운영과 분리된 PostgreSQL 테스트 DB 및 합성 데이터로 `backend/`에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py test pbt accounts question_bank --noinput
```

Django 테스트 러너는 `test_<DB_NAME>` 테스트 DB를 생성·삭제합니다. 운영 연결 설정으로 실행하지 않습니다.
메일은 테스트에서 대체하므로 실제 이메일은 보내지 않습니다. 서버 입력 검증, 소유권, 점수·정답 비공개,
교차 브라우저 열람, 토큰 변조·만료·교체, 재발송·동시 요청, 기존 회원가입 메일과 응시 기능을 확인합니다.
`frontend-TOPIQ/`에서는 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`를 실행합니다.


### TOPIQ 회원가입 학습 설문

회원가입은 이메일 인증 → 닉네임·비밀번호 설정 → 학습 설문 → 가입 완료 순서입니다.
계정 설정과 설문 사이를 이동해도 입력값을 유지하고, 비밀번호와 설문을 브라우저 저장소에 저장하지 않습니다.
가입 설문에는 별점이 없으며 이메일은 인증된 회원 정보를 사용합니다. 기존 회원에게 설문을 소급 요구하지 않습니다.

신규 API는 없습니다. 기존 `POST /api/auth/signup/`는 계정 필드(`email`, `nickname`, `password`,
`password_confirm`, `verification_token`)와 함께 `language`(`ko`/`en`/`id`), `survey` 객체를 필수로 받습니다.
`survey`의 문항 키와 조건부 검증은 위 시험 설문과 같으며, 가입 동의 버전은 `topiq_signup_privacy_v1`입니다.
시험용 동의 버전으로 가입할 수 없습니다. 설문 버전 `signup_survey_v1`과 완료·동의 시각은 서버가 기록합니다.
인증 토큰은 최종 제출 시에도 검증하며, 계정과 설문을 하나의 트랜잭션으로 저장한 뒤에만 자동 로그인합니다.
검증 오류는 기존 `400 validation_error`와 `fields`에 반환합니다. 구버전 클라이언트는 설문 없이 가입할 수 없으므로
백엔드와 프론트엔드를 같은 배포 작업에서 반영합니다.

신규 테이블 **`signup_survey_responses`**는 `auth_user`와 1:1로 연결됩니다. 언어, 국적, 출생연도,
응시 목적·기타 목적, 학습 기간, 응시 경험, 현재·목표 급수, 설문/동의 버전과 시각을 저장합니다.
이메일은 사용자 관계에서 참조하고 별점·결과 메일 필드는 저장하지 않습니다.
Django 관리자에서 조회 권한이 있는 담당자만 이메일·닉네임으로 검색하고 언어·국적·목표 급수·완료 시각으로
필터링할 수 있습니다. 가입 당시의 기록이므로 관리자 화면에서는 추가·수정·삭제하지 않습니다.
기존 시험 설문과 가입 설문은 각 응답 시점의 기록이며, 답변을 자동 복사하거나 통합하지 않습니다.

문항·서버 검증은 `backend/surveys/learner.py`, 프론트 문항·검증은
`frontend-TOPIQ/src/lib/learner-survey.ts`, 공통 입력 UI는 `components/LearnerSurveyForm.tsx`에서 관리합니다.
가입과 시험의 동의 문구·버전은 각각 관리하고 카탈로그 일치 여부는 테스트로 확인합니다.

**로컬 적용:** 코드를 받은 뒤 새 백엔드를 시작하기 전에 개발자가 `backend/`에서 수동 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py migrate
```

`migration/surveys/0002_signup_survey_response.py`가 새 테이블, 회원 1:1 관계와 급수 제약을 생성합니다.
이 명령은 다른 미적용 마이그레이션도 함께 적용할 수 있습니다. 에이전트와 개발 서버는 로컬에 자동 적용하지 않습니다.
운영에서는 기존 `deploy/start.sh`가 migration 후 Gunicorn을 시작하는 절차를 유지합니다.
추가 환경 변수, 백그라운드 작업자, 관리 명령은 필요하지 않습니다.

**검증:** 개발·운영과 분리된 PostgreSQL 테스트 연결 설정으로 `backend/`에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py test accounts pbt surveys --noinput
```

Django 테스트 러너가 테스트 DB를 생성·삭제하며 실제 이메일은 보내지 않습니다. 가입 필수 설문, 동의 버전,
조건부 문항, 중복 가입, 계정·설문 원자적 저장, 기존 인증 및 PBT/IBT 설문을 확인합니다.
프론트엔드는 `frontend-TOPIQ/`에서 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`로 검증합니다.

### 회원가입·시험 후 설문 CSV 다운로드

Django 관리자에서 아래 목록을 열고 검색·필터를 지정한 뒤 우측 상단 **CSV 다운로드**를 누릅니다.
현재 페이지뿐 아니라 검색·필터에 맞는 모든 응답을 한 건당 한 행으로 내려받습니다.
파일명에는 한국 시간 기준 다운로드 시각이 들어갑니다.

| 관리자 목록 | 다운로드 경로 | 파일명 접두어 |
|---|---|---|
| Surveys → Signup survey responses | `GET /admin/surveys/signupsurveyresponse/export-csv/` | `signup_survey_responses_` |
| Pbt → Exam attempt feedbacks | `GET /admin/pbt/examattemptfeedback/export-csv/` | `exam_attempt_feedback_` |

가입 설문 CSV에는 회원 ID, 회원의 현재 이메일·닉네임, 응답 언어와 전체 설문 답변,
설문·동의 버전 및 시각이 들어갑니다. 별점은 포함하지 않습니다.
시험 후 설문 CSV에는 응시 ID, 결과 수신 이메일, PBT/IBT, 응시 당시 시험명·영역·모드,
점수·별점·언어·시험 제출 시각·메일 상태와 전체 설문 답변, 설문·동의 버전 및 시각이 들어갑니다.
시험 후 설문이 저장된 응시만 대상으로 하며, 결과 인증 토큰·해시는 내보내지 않습니다.

열 이름과 선택 항목명은 한국어이고, 국적은 국가 코드, 응답 언어는 `ko`/`en`/`id`로 표시합니다.
복수 응시 목적은 `; `로 구분합니다. 현재 급수의 NULL은 빈 셀, 0은 `급수 없음`으로 표시하고
점수 0은 그대로 보존합니다. 시각은 `+09:00`이 포함된 한국 시간 ISO 형식입니다.
UTF-8 BOM과 CSV 인용 처리를 적용해 Excel에서 한글·쉼표·따옴표·줄바꿈을 보존합니다.
수식처럼 보이는 사용자 입력은 CSV에서만 텍스트로 처리하며 원본 데이터는 변경하지 않습니다.

활성 관리자 계정이면서 해당 모델 조회 권한이 있어야 목록과 다운로드에 접근할 수 있습니다.
회원가입 설문과 시험 설문의 권한은 각각 적용합니다. 잘못된 필터는 오류를 반환하며 필터를 풀어
전체 데이터를 내보내지 않습니다. 결과가 없으면 열 이름만 있는 CSV를 제공합니다.

이 기능은 관리자 전용 GET 경로 두 개를 추가하며, DB 구조·테이블·migration 변경은 없습니다.
백엔드 코드를 반영한 뒤 관리자 화면에서 수동 다운로드합니다. 별도 실행 명령, 예약 작업,
환경 변수나 프론트엔드 배포는 필요하지 않습니다.

분리된 PostgreSQL 테스트 설정에서 `backend/`를 실행 위치로 사용해 검증합니다.

```powershell
.\.venv\Scripts\python.exe manage.py test surveys pbt.test_feedback accounts.test_signup_survey --noinput
```

Django 테스트 러너가 테스트 DB를 생성·삭제하며 운영·개발 DB 설정으로 실행하지 않습니다.
권한 분리, 읽기 전용 관리자 목록의 버튼, 검색·필터와 페이지 처리, CSV 형식·수식 처리,
토큰 제외와 원본 데이터 보존, 관련 회원·시험 정보를 조회할 때 불필요한 반복 쿼리가 없는지 확인합니다.
