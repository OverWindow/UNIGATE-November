# TOPIQ Frontend

TOPIK II 읽기·쓰기 문제와 단어장을 위한 프론트엔드입니다.
Next.js App Router, React, TypeScript, Tailwind CSS v4를 사용합니다.
백엔드는 저장소의 기존 `backend/` Django 프로젝트를 함께 사용합니다.
현재는 TOPIQ 서비스 소개용 랜딩 페이지가 구성되어 있습니다.
한국어·영어·인도네시아어 전환, 학습 영역 선택, 모바일 메뉴, FAQ를 제공합니다.
실제 문제풀이·채점·회원가입·학습 기록 기능은 포함하지 않습니다.

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

API 연결 작업 시 `.env.example`을 `.env.local`로 복사하고 Django 주소를 설정합니다.

```powershell
Copy-Item .env.example .env.local
```

`NEXT_PUBLIC_BACKEND_URL`은 브라우저에 공개할 백엔드 origin입니다.
기본 예시는 `http://localhost:8000`이며 `/api` 경로는 붙이지 않습니다.
DB 접속 정보와 비밀 키는 프론트엔드에 넣지 않습니다.
환경 변수를 바꾼 뒤 개발 서버를 재시작하고, 운영 빌드는 다시 실행하세요.
현재 랜딩 페이지는 API를 호출하지 않으므로 백엔드를 실행하지 않아도 확인할 수 있습니다.

향후 브라우저에서 Django API를 호출할 때 백엔드의
`DJANGO_CSRF_TRUSTED_ORIGINS`에 `http://localhost:3001`을 추가해야 합니다.
이 설정은 기존 백엔드의 CORS 허용 목록으로도 사용됩니다.
기존 unigate origin도 함께 유지하고, CSRF 토큰과 쿠키를 사용하는 방식으로 연결하세요.
백엔드 실행 방법은 [프로젝트 README](../README.md)를 참고하세요.

## 검사와 빌드

아래 명령은 `frontend-TOPIQ/`에서 실행합니다.

```powershell
npm run lint
npm run typecheck
npm run build
npm start
```

`lint`는 Oxlint, `typecheck`는 Next.js 라우트 타입 생성과 엄격한 TypeScript 검사를 실행합니다.
`build`는 `.next/`에 운영 빌드를 생성하고, `start`는 이를 포트 3001에서 실행합니다.
의존성 설치에는 커밋된 `package-lock.json`과 `npm ci`를 사용합니다.

## 주요 파일

| 경로 | 용도 |
| --- | --- |
| `src/app/page.tsx` | 랜딩 페이지 진입점 |
| `src/components/LandingPage.tsx` | 랜딩 화면과 언어·메뉴·학습 선택 동작 |
| `src/lib/landing-content.ts` | 한국어·영어·인도네시아어 문구 |
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
