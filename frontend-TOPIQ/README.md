# TOPIQ Frontend

TOPIK II 읽기·쓰기 문제와 단어장을 위한 프론트엔드입니다.
Next.js App Router, React, TypeScript, Tailwind CSS v4를 사용합니다.
백엔드는 저장소의 기존 `backend/` Django 프로젝트를 함께 사용합니다.
TOPIQ 서비스 소개용 랜딩 페이지와 PBT·IBT 안내 페이지가 구성되어 있습니다.
한국어·영어·인도네시아어 전환, 모바일 메뉴, FAQ와 회원가입·로그인을 제공합니다.
PBT 읽기·듣기 모의고사, 자동 저장·채점·응시 기록을 제공합니다.

## PBT·IBT 모의고사 안내

헤더의 PBT·IBT 메뉴는 각각 `/pbt`, `/ibt`로 연결되며 모바일에서도 이동할 수 있습니다.
PBT에서는 읽기·듣기를 각각 선택하고 연습 또는 실전으로 응시합니다. 각 세트는 50문항·100점이며 문항당 2점입니다.
연습은 시간 제한이 없고 실전은 듣기 60분, 읽기 70분입니다. 듣기는 두 모드 모두 문항 또는 공통 음원 묶음 진입 3초 후 자동 재생됩니다.
연습에서는 재생·일시정지·탐색·반복이 가능하고, 실전에서는 조작 버튼 없이 재생 상태를 표시하며 음원 재생 중 문항 이동을 제한합니다.
실전에서 재생을 시작한 문항의 음원은 같은 브라우저 탭에서 재방문하거나 새로고침해도 다시 재생하지 않습니다. 이 기록은 프론트엔드 메모리와 `sessionStorage`로 관리하며 서버의 응시 기록이나 DB를 변경하지 않습니다.
브라우저가 자동 재생을 차단하면 음원 시작 버튼을 표시합니다. 로딩 오류는 다시 시도할 수 있으며, 같은 화면에서 재시도하면 마지막 재생 위치부터 이어집니다. 결과·해설 화면의 음원은 자동 재생하지 않고 자유롭게 조작할 수 있습니다.
비회원에게는 읽기 3세트·듣기 3세트(총 300문항)를 공개하며, 회원은 공개된 모든 세트에 접근합니다.
비회원 소유권은 HttpOnly Django 세션 쿠키에 연결되며 쿠키 삭제·세션 만료·로그아웃 시 해당 기록에 접근할 수 없습니다.
로그인한 채 새로 시작한 응시는 계정에 저장됩니다. 로그인 전에 시작한 비회원 응시는 같은 세션에서 계속 접근할 수 있지만 계정으로 이관하지 않습니다.
`/pbt/attempts/[id]`에서 답안표·공통 지문·그림 선택지와 자동 저장을 제공하고 `/pbt/attempts/[id]/result`에서 점수·정답·해설·듣기 대본을 확인합니다.
실전 시간은 서버 마감 시각을 따릅니다. 브라우저를 닫거나 새로고침해도 시간이 초기화되지 않습니다. 제출 전에는 정답·해설·대본이 전송되지 않습니다.
서버 응답으로 저장을 확인하지 못하면 선택을 되돌리고 재선택을 안내합니다. 전송 중에는 추가 답안 변경과 제출을 잠시 막습니다.
IBT는 기존 안내·준비 중 화면을 유지합니다. 쓰기는 이번 PBT 기능에 포함하지 않습니다.
랜딩의 기존 선택 패널은 제거했으며 ‘학습 살펴보기’는 학습 소개 영역으로 이동합니다.

문제 등록과 API·테이블 설명은 [프로젝트 README의 PBT 항목](../README.md#pbt-모의고사)을 참고하세요.

## 개발 실행

Node.js 24와 npm을 사용합니다. 프로젝트 루트에서 실행합니다.

```powershell
cd frontend-TOPIQ
npm ci
npm run dev
```

브라우저에서 <http://localhost:3001>에 접속합니다.
기존 unigate 프론트엔드의 기본 포트는 3000이며, TOPIQ는 3001을 사용합니다.
서버는 `Ctrl+C`로 종료합니다.

## 환경 변수와 백엔드

`.env.example`을 `.env.local`로 복사하고 Django 주소를 설정합니다.

```powershell
Copy-Item .env.example .env.local
```

`DJANGO_BACKEND_URL`은 Next.js 서버가 사용하는 백엔드 origin입니다.
기본값은 `http://127.0.0.1:8000`이며 `/api` 경로는 붙이지 않습니다.
DB 접속 정보와 비밀 키는 프론트엔드에 넣지 않습니다.
rewrite의 전달 주소는 빌드 시 반영되므로 운영 빌드 전에 지정하고, 변경하면 다시 빌드합니다.
개발에서는 서버를 재시작합니다. 브라우저는 같은 origin의 `/api/auth/…`, `/api/csrf/`, `/api/pbt/…`를 호출합니다.

백엔드의 `DJANGO_CSRF_TRUSTED_ORIGINS`에 `http://localhost:3001`을 추가합니다.
127.0.0.1을 브라우저 주소로 쓰면 `http://127.0.0.1:3001`도 등록합니다.
운영은 `https://topiq.unigate.kr`을 등록하고 기존 unigate origin도 함께 유지합니다.
백엔드 실행 방법은 [프로젝트 README](../README.md)를 참고하세요.

백엔드가 중지되어도 랜딩 페이지는 표시됩니다. 인증 상태는 비로그인과 구분해 재연결 버튼을 제공합니다.

## 회원가입과 로그인

헤더 로그인 버튼은 `/login`, 회원가입 링크는 `/signup`으로 연결됩니다.
가입은 이메일 입력 → Brevo 인증 메일 확인 → 닉네임·비밀번호·비밀번호 확인 순서이며 성공하면 자동 로그인합니다.
인증 링크는 15분 동안 유효하고 `/verify-email#token=…`에서 검증합니다. 인증된 이메일은 가입 화면에서 변경할 수 없습니다.
메일 재발송은 60초 뒤 가능하며, 만료·위조·발송 실패·횟수 제한을 세 언어로 안내합니다.
로그인 후 헤더에 닉네임과 로그아웃을 표시하며 새로고침 시 서버 세션으로 상태를 복원합니다.
기존 Django `auth_user`, `django_session`을 사용하고 인증 토큰을 localStorage에 저장하지 않습니다.
비밀번호 재설정·소셜 로그인은 아직 제공하지 않습니다. 기존 가입 계정의 로그인 방식은 유지합니다.
Brevo 키·발신자와 `TOPIQ_PUBLIC_URL`은 Django에만 설정합니다. 프론트엔드에는 메일 API 키를 넣지 않습니다.

먼저 개발 백엔드에서 마이그레이션을 적용하세요. 사용자 테이블의 이메일 고유 인덱스와 시도 제한용 `accounts_rate_limit` 테이블을 관리합니다.
기존 사용자·세션 테이블과 컬럼은 유지하고 별도 DB 캐시는 생성하지 않습니다. 기존 중복 이메일이 있으면 자동 변경 없이 마이그레이션이 중단됩니다.
제한 기록은 PostgreSQL에 보존되어 서버 재시작이나 캐시 정리로 사라지지 않습니다. 제한 저장소 오류는 503으로 안내합니다.
프록시 IP 처리와 기존 제한 수치는 유지합니다. 만료 기록 정리 명령은 [프로젝트 README](../README.md)를 참고하세요.
실제 DB에 시험용 가입을 하지 않고 별도 테스트 DB에서 검증합니다.

## 검사와 빌드

아래 명령은 `frontend-TOPIQ/`에서 실행합니다.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`lint`는 Oxlint, `typecheck`는 Next.js 라우트 타입 생성과 엄격한 TypeScript 검사를 실행합니다.
`build`는 `.next/`에 운영 빌드를 생성하고, `start`는 이를 포트 3001에서 실행합니다.
운영 서버를 시작한 상태에서 같은 출력 디렉터리를 다시 빌드하지 마세요.
의존성 설치에는 커밋된 `package-lock.json`과 `npm ci`를 사용합니다.

## Docker 배포

TOPIQ 프론트엔드만 빌드하며, 기존 Django 백엔드는 별도로 실행합니다.
배포할 때 저장소 루트에서 아래 명령을 수동 실행합니다.
`https://api.example.com`은 컨테이너에서 접근할 수 있는 실제 Django origin으로 바꿉니다.

```sh
docker build --build-arg DJANGO_BACKEND_URL=https://api.example.com -t topiq-frontend ./frontend-TOPIQ
docker run -d --name topiq-frontend -p 3001:3001 topiq-frontend
```

Node.js 24로 standalone 빌드한 뒤 필요한 실행 파일과 정적 파일만 포함합니다.
컨테이너는 비관리자 사용자로 `node server.js`를 자동 실행하며 `0.0.0.0:3001`에서 수신합니다.
로컬 확인 주소는 `http://localhost:3001`입니다.
배포 플랫폼에서는 빌드 컨텍스트를 `frontend-TOPIQ/`, Dockerfile을 `Dockerfile`, 서비스 포트를 `3001`로 지정하고 HTTPS를 연결합니다.
상태 검사 경로 `/`는 프론트엔드만 확인하며 백엔드 연결 상태는 포함하지 않습니다.

Cloudtype에서는 서비스 설정의 **Build arguments(ARG)**에 이름 `DJANGO_BACKEND_URL`과 실제 Django origin을 추가하고 **배포하기**로 다시 빌드합니다.
**Environment variables(ENV)**는 컨테이너 실행 시 적용되므로 여기에만 입력하면 빌드에 전달되지 않습니다.
`Set the DJANGO_BACKEND_URL build argument.` 오류는 이 빌드 인자가 비어 있다는 뜻입니다.
설정 구분은 [Cloudtype Dockerfile 문서](https://docs.cloudtype.dev/ko/developers/dockerfile)를 참고하세요.

`DJANGO_BACKEND_URL`은 필수 **빌드 인자**입니다. 주소를 바꾸면 이미지를 다시 빌드하고 컨테이너를 교체해야 합니다.
런타임 환경변수만 바꿔서는 API 전달 주소가 변경되지 않습니다.
컨테이너의 `localhost`는 컨테이너 자신이므로 별도 Django 서비스의 주소를 사용합니다.
`.env*` 파일은 이미지에 포함하지 않으며 DB 비밀번호·메일 API 키도 전달하지 않습니다.

배포 전에 백엔드의 `DJANGO_CSRF_TRUSTED_ORIGINS`에 TOPIQ 공개 origin(예: `https://topiq.unigate.kr`)을 등록합니다.
이 Dockerfile은 API·DB 테이블을 추가하거나 변경하지 않으며 마이그레이션을 실행하지 않습니다.
배포 후 홈페이지·로그인·PBT 화면과 API 연결을 확인합니다.

## IBT 듣기 지문별 진행

실전 듣기는 전체 35분 제한 없이 각 지문에서 대기 3초 → 음원 재생 → 풀이 순서로 진행합니다.
풀이 시간은 지문당 1문항 13초, 2문항 20초이며, 종료 시 다음 지문으로 이동하고 마지막 지문에서는 자동 제출합니다.
답안 저장 중이면 저장 요청이 끝난 뒤 이동·제출합니다. 제출에 실패하면 화면의 다시 시도 버튼으로 재전송할 수 있습니다.
상단의 대기·듣기·풀이 타이머 중 현재 단계가 초록색으로 표시됩니다.
실전의 하단 재생 위치는 표시 전용이고 음량만 조절할 수 있습니다. 연습에서는 탐색·재생·일시정지와 이전·전체 문제·다음 버튼을 사용할 수 있으며 풀이 제한이 없습니다.
자동 재생이 차단되면 음원 시작 버튼을 누릅니다. 음원이 끝나기 전에는 풀이 시간이 차감되지 않습니다.
실전의 현재 지문·재생 위치·풀이 마감은 같은 탭의 sessionStorage에 보관하여 새로고침 시 복구합니다.
다른 브라우저나 저장소가 삭제된 탭으로 진행 위치를 동기화하지는 않습니다.

### 백엔드 적용 (필수)

변경된 백엔드를 사용하기 **전에**, 저장소의 `backend/`에서 개발 가상환경을 활성화한 사용자가 다음 명령을 **수동 실행**합니다.

```sh
python manage.py migrate
```

`migration/pbt/0004_ibt_listening_passage_timing.py`는 기존 `pbt_attempts`의 만료 시각 제약을 완화하고,
진행 중인 IBT 듣기 실전의 `expires_at`을 비웁니다. 제출 완료된 기록과 점수는 유지합니다.
새 API·테이블·컬럼은 없습니다. 기존 IBT 듣기 목록의 `durationSeconds`와 응시 정보의 `expiresAt`은 `null`을 반환합니다.
PBT 및 IBT 읽기의 전체 제한 시간은 유지됩니다. 에이전트가 로컬 DB에 migration을 실행하지는 않습니다.
운영 배포에서는 기존 `backend/deploy/start.sh`가 Gunicorn 시작 전에 migration을 **자동 실행**하므로 별도 작업자를 추가하지 않습니다.

## 주요 파일

| 경로 | 용도 |
| --- | --- |
| `src/app/page.tsx` | 랜딩 페이지 진입점 |
| `src/components/LandingPage.tsx` | 랜딩 화면과 학습 소개 |
| `src/lib/landing-content.ts` | 한국어·영어·인도네시아어 문구 |
| `src/app/pbt/page.tsx`, `src/app/ibt/page.tsx` | PBT·IBT 페이지 진입점과 메타데이터 |
| `src/components/ExamPage.tsx` | 공통 시험 안내와 모의고사 응시 준비 화면 |
| `src/components/pbt/` | PBT 목록·응시·결과·문항·음성 화면 |
| `src/lib/pbt-api.ts`, `src/lib/pbt-content.ts` | PBT API·시간 계산·세 언어 문구 |
| `src/app/pbt/pbt.css` | PBT 반응형 화면 스타일 |
| `src/lib/exam-content.ts` | 세 언어의 시험 설명과 응시 패널 문구 |
| `src/components/SiteFooter.tsx` | 랜딩·시험 페이지의 공통 푸터 |
| `src/app/providers.tsx` | 공통 언어·인증 상태 |
| `src/components/AuthScreen.tsx` | 로그인·가입 화면 |
| `src/components/SiteHeader.tsx` | 공통 헤더와 회원 상태 |
| `src/lib/auth-api.ts` | 인증 요청·CSRF·안전한 복귀 경로 |
| `src/lib/auth-content.ts` | 세 언어의 인증 문구 |
| `src/components/EmailVerificationRequest.tsx` | 인증 메일 발송·재발송 화면 |
| `src/components/EmailVerificationScreen.tsx` | 링크 검증과 인증 후 가입 화면 |
| `src/lib/email-content.ts` | 세 언어의 이메일 인증 문구 |
| `src/app/layout.tsx` | 공통 레이아웃과 메타데이터 |
| `src/app/globals.css` | Tailwind CSS 가져오기와 공통 스타일 |
| `next.config.ts` | Next.js 설정 |
| `postcss.config.mjs` | Tailwind CSS v4 PostCSS 플러그인 |
| `tsconfig.json` | 엄격한 타입 검사와 `@/*` → `src/*` 경로 별칭 |
| `public/` | 정적 파일 |

TOPIQ 로고는 [기존 서비스](https://topiq.unigate.kr/logo.png)의 원본을
`public/brand/topiq-logo.png`에 보관해 사용하며 색상과 비율을 유지합니다.
화면의 읽기 문제는 이 랜딩 페이지를 위해 작성한 정적인 학습 예시입니다.

참고: [Next.js 설치 문서](https://nextjs.org/docs/app/getting-started/installation),
[Tailwind CSS의 Next.js 설정](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
