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
.\.venv\Scripts\python.exe manage.py sync_pbt_exams --check
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

## PBT 모의고사

`frontend-TOPIQ`의 `/pbt`에서 듣기·읽기와 연습·실전 모드를 각각 선택합니다.
세트당 50문항, 문항당 2점, 영역별 100점 만점입니다. 연습은 시간 제한이 없고 실전은 듣기 3,600초, 읽기 4,200초입니다.
두 모드 모두 듣기 음원을 자유롭게 재생·반복·탐색할 수 있습니다. 쓰기와 IBT 문제풀이는 포함하지 않습니다.

회원은 공개된 모든 세트, 비회원은 지정된 읽기 3세트·듣기 3세트(300문항)에 접근합니다.
각 영역에 `guest_slot` 1~3을 할당하며 DB의 범위·고유 제약으로 비회원 공개 세트 수를 제한합니다.
권한은 목록뿐 아니라 응시 생성 API에서도 확인합니다. 비회원 기록은 Django 세션의 무작위 소유자 UUID와 연결하고, 회원 응시는 기존 사용자 계정과 연결합니다.
비회원 세션에서 로그인하면 기존 비회원 기록도 계속 볼 수 있지만 계정으로 자동 이관되지는 않습니다. 쿠키 삭제·만료·로그아웃 시 비회원 기록에 대한 접근이 사라집니다.

로그인한 사용자의 세트 카드에는 기존 우측 상단 배지 자리에 선택한 모드의 최근 제출 점수를 표시합니다.
점수 배지를 누르면 결과로 이동하며, 마우스를 올리거나 스크린 리더로 읽으면 모드·제출일도 확인할 수 있습니다. 카드 높이와 기존 정보 배치는 유지합니다.
이 요약은 계정에 저장된 전체 응시 기록에서 세트·모드별 최근 제출을 조회하므로 최근 100건에 포함되지 않은 결과도 표시합니다.
진행 중인 응시가 있으면 `이어풀기`, 제출 기록만 있으면 `다시 풀기`, 기록이 없으면 `응시 시작`을 제공합니다.
재응시 중에도 이전 제출 점수는 유지하며, 비회원 기록은 카드 요약에 포함하지 않습니다.

문제은행이 준비된 환경에서 기존 DB 연결을 확인한 후 실행합니다.

```powershell
cd backend
$env:DJANGO_ENV = 'development' # 운영에서는 production
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py sync_pbt_exams --check
.\.venv\Scripts\python.exe manage.py sync_pbt_exams
```

`--check`는 등록하지 않고 자료 준비 상태를 조회합니다. 등록 명령은 1~50번 문항, 정답, 선택지, 현재 음성 연결, 듣기 그림 선택지, 읽기 10번 자료 이미지를 검증합니다.
`exam_format='pbt'`인 완성된 세트만 `pbt_exams`에 등록·공개하며, 최초 등록 시 생성 시각과 UUID 순으로 영역별 첫 3개에 비회원 슬롯을 할당합니다.
IBT 세트는 동기화와 PBT 시험 목록에서 제외하며, 직접 요청으로 새 PBT 응시를 생성할 수도 없습니다.
기존 응시의 조회·이어풀기·채점은 저장된 스냅샷을 사용합니다.
후속 실행은 기존 시험 제목·회차·공개 여부·슬롯을 보존합니다. 새 Hub 세트를 전송한 뒤 명령을 다시 실행하면 추가 세트가 등록됩니다.
세트 상태나 자료가 이후 변경되면 응시 시작 시 다시 검증하고, 불완전한 세트는 409로 안내합니다. 관리자에서 공개 상태와 비회원 슬롯을 조정할 수 있습니다.
운영 시작 스크립트는 마이그레이션을 적용하지만 이 등록 명령은 자동 실행하지 않습니다.

추가 테이블은 아래 3개이며 원본 `topik_bank`와 기존 사용자 테이블은 수정하지 않습니다.

| 테이블 | 목적 |
|---|---|
| `pbt_exams` | 원본 세트 UUID, 표시 제목·회차, 영역, 공개 여부, 비회원 슬롯 |
| `pbt_attempts` | 사용자 또는 비회원 소유자, 모드, 시작·마감·제출 시각, 상태·점수 |
| `pbt_attempt_items` | 응시 시점 문제·정답·해설·대본·미디어 참조 사본과 선택 답안·채점 결과 |

| HTTP 메서드 | 경로 | 목적 |
|---|---|---|
| GET | `/api/pbt/exams/` | 시험 목록·접근 가능 여부와 로그인 사용자의 세트·모드별 최근 결과 및 진행 중 응시 |
| POST | `/api/pbt/attempts/` | 응시 시작 또는 같은 모드의 진행 중 응시 재개 |
| GET | `/api/pbt/attempts/` | 본인의 최근 100개 응시 기록 |
| GET | `/api/pbt/attempts/<id>/` | 본인 응시 상태·문제·저장 답안 |
| PUT | `/api/pbt/attempts/<id>/answers/<position>/` | `selectedOption` 1~4 저장 또는 `null`로 해제 |
| POST | `/api/pbt/attempts/<id>/submit/` | 멱등 제출·채점 |
| GET | `/api/pbt/attempts/<id>/result/` | 제출 후 점수·정답·해설·대본 |

`GET /api/pbt/exams/`의 각 세트에는 `myProgress`가 포함됩니다. 비회원은 `null`, 회원은 `practice`·`timed` 각각에
`latestResult`(제출 기록이 없으면 `null`, 있으면 `id`·`score`·`maxScore`·`submittedAt`)와 `inProgressId`(없으면 `null`)를 받습니다.
카드 조회에서도 시간이 지난 본인 실전 응시는 기존 채점 절차로 확정합니다. 점수 표시에는 새 테이블·마이그레이션이나 별도 수동 실행이 필요하지 않습니다.

변경 요청은 CSRF 검사를 수행하고 응답은 `private, no-store`입니다. 제출 전 API 응답은 표시용 필드만 포함하며 원본 `content_json`을 그대로 노출하지 않습니다.
서버가 저장한 마감 시각 이후 답안 변경은 거절합니다. 열린 화면은 시간 종료 시 제출을 요청하고, 브라우저가 닫혀 있으면 다음 조회·저장·제출 요청에서 마감 시각 기준으로 확정합니다. 백그라운드 워커는 사용하지 않습니다.
답안 저장과 제출은 같은 응시 행을 잠그므로 채점 중 답안 변경과 중복 채점을 방지합니다. 시작 요청은 소유자별 시간당 30회로 제한하고 기존 시도 제한 테이블을 재사용합니다.

검증은 `python manage.py test` 및 `frontend-TOPIQ`의 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`로 실행합니다.
PBT 테스트는 격리된 PostgreSQL 테스트 DB에서 합성 문제로 비회원 제한, 소유권, CSRF, 무제한 연습, 시간 만료, 답안 저장·채점·스냅샷 보존, 미디어 누락을 검사합니다.

