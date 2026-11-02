# TOPIQ Frontend

TOPIK II 읽기·쓰기 문제와 단어장을 위한 프론트엔드입니다.
Next.js App Router, React, TypeScript, Tailwind CSS v4를 사용합니다.
백엔드는 저장소의 기존 `backend/` Django 프로젝트를 함께 사용합니다.
TOPIQ 서비스 소개용 랜딩 페이지와 PBT·IBT 안내 페이지가 구성되어 있습니다.
한국어·영어·인도네시아어 전환, 모바일 메뉴, FAQ와 회원가입·로그인을 제공합니다.
실제 문제풀이·채점·학습 기록 기능은 포함하지 않습니다.

## PBT·IBT 모의고사 안내

헤더의 PBT·IBT 메뉴는 각각 `/pbt`, `/ibt`로 연결되며 모바일에서도 이동할 수 있습니다.
각 페이지는 시험 방식의 짧은 설명 아래에 모의고사 응시 패널을 표시합니다.
설명은 [교육부·국립국제교육원 공식 안내](https://www.niied.go.kr/convert/preview/1764509391006/index.html)를 기준으로 작성했습니다.

영역은 읽기·쓰기 중 선택할 수 있고 기본값은 읽기입니다. 선택은 페이지 내부에서만 관리합니다.
현재 등록된 모의고사가 없어 회차 선택과 응시 버튼은 비활성화되어 있으며, 준비 중 안내를 제공합니다.
실제 문제풀이·채점·응시 기록과 모의고사 API·DB 테이블은 추가하지 않았습니다.
랜딩의 기존 선택 패널은 제거했으며 ‘학습 살펴보기’는 학습 소개 영역으로 이동합니다.

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
개발에서는 서버를 재시작합니다. 브라우저는 같은 origin의 `/api/auth/…`, `/api/csrf/`만 호출합니다.

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

## 주요 파일

| 경로 | 용도 |
| --- | --- |
| `src/app/page.tsx` | 랜딩 페이지 진입점 |
| `src/components/LandingPage.tsx` | 랜딩 화면과 학습 소개 |
| `src/lib/landing-content.ts` | 한국어·영어·인도네시아어 문구 |
| `src/app/pbt/page.tsx`, `src/app/ibt/page.tsx` | PBT·IBT 페이지 진입점과 메타데이터 |
| `src/components/ExamPage.tsx` | 공통 시험 안내와 모의고사 응시 준비 화면 |
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
