# UNIGATE Landing Page

인도네시아어 프로모션 단일 페이지입니다. Next.js App Router, React, TypeScript와 일반 CSS를 사용하며 Node.js 24가 필요합니다.
이미지와 애니메이션은 소스에 통합되어 있습니다. Tailwind·아이콘 라이브러리·다국어 전환·이용자 인증은 사용하지 않습니다.
별도 `frontend-TOPIQ/`는 이 프론트엔드의 빌드나 정리에 포함하지 않습니다.

## 개발

```sh
npm ci
npm run dev
```

`http://localhost:3000`에서 확인합니다. PDF 신청은 기본 `http://localhost:8000`의 Django에 직접 저장합니다.
백엔드 없이도 화면은 볼 수 있으나 신청은 완료되지 않습니다. PDF는 운영자가 수동 발송합니다.

## 주요 파일

| 역할 | 파일 |
|---|---|
| 전체 화면·통계 팝업 | `src/app/page.tsx` |
| 반응형 스타일·CSS 애니메이션 | `src/styles/index.css` |
| 입자·캐릭터·스크롤·갤러리 | `src/components/LandingEffects.tsx` |
| 신청 폼·검증·제출 | `src/components/TransferRequest/index.tsx` |
| 신청 문구·항목 코드 | `src/lib/survey.ts` |
| 대학 카드·사진 라이선스 | `src/lib/landing/universities.json` |
| 팝업 모션 | `src/lib/landing/modal.ts` |
| 이미지 11개 | `public/landing/` |

## 검사와 정적 빌드

```sh
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run lint
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run typecheck
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run build
npm run preview
```

PowerShell에서는 `$env:NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"`을 먼저 설정하고 npm 명령을 실행합니다.
출력은 `out/`입니다. `preview`는 포트 3000의 정적 서버이며 `PORT`로 포트를 바꿀 수 있습니다.
브라우저와 백엔드는 같은 호스트명(`localhost` 또는 `127.0.0.1`)을 사용해야 개발 쿠키가 동작합니다.

## 배포

저장소 루트에서:

```sh
docker build --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com -t unigate-frontend ./frontend
docker run --rm -p 8080:8080 unigate-frontend
```

Nginx는 HTTP 8080에서 정적 파일만 제공합니다. HTTPS는 배포 플랫폼에서 설정합니다.
백엔드 origin은 빌드 때 포함되므로 바꾸면 다시 빌드해야 합니다. `/api` 경로나 비밀 값을 넣지 않습니다.
이전 홈페이지 경로 네 개는 랜딩페이지 `/`로 연결합니다. API 프록시는 없습니다.

Django 설정, 신청 API, 관리자, CSV 내보내기와 배포 환경변수는 [루트 README](../README.md)를 참고하세요.
