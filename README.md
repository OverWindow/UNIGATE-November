# Unigate

대학 편입·한국어 교육 서비스입니다. 현재 React + Vite 프론트엔드의 시작 앱이 구현되어 있습니다.
기존 Django 백엔드는 의도적으로 삭제했으며, `backend/`는 `.gitkeep`만 있는 빈 폴더입니다. 현재 저장소에는 실행 가능한 백엔드, API, DB 연동 또는 백엔드 배포 설정이 없습니다.
소스 코드 삭제가 외부 DB나 Docker 컨테이너의 삭제를 의미하지는 않습니다.

## 프로젝트 구조

```text
unigate-main/
├─ frontend/          # React + Vite 프론트엔드
│  ├─ public/         # 로고 등 정적 파일
│  ├─ src/            # React 화면과 CSS
│  ├─ Dockerfile      # 프론트엔드 배포 이미지
│  ├─ nginx.conf      # 정적 파일 서버 설정
│  ├─ package.json
│  └─ package-lock.json
├─ backend/           # .gitkeep만 있음, 백엔드 미구현
├─ AGENTS.md          # 프로젝트 작업 지침
├─ DESIGN.md          # 디자인 기준과 공식 로고 안내
├─ README.md
└─ .gitignore
```

프론트엔드와 백엔드 폴더는 하나의 Git 저장소에서 관리합니다.
`.gitkeep`은 Git에서 빈 폴더 구조를 유지하기 위한 파일입니다.

## 프론트엔드 개발 실행

Node.js 24와 npm이 필요합니다. 현재 화면 실행에는 Python·DB·Docker 설정이 필요 없습니다.
아래 명령은 프로젝트 루트(`unigate-main`)에서 시작하는 Windows PowerShell 기준입니다.

처음 실행하거나 의존성(`package.json` 또는 `package-lock.json`)이 변경되었을 때:

```powershell
cd frontend
npm ci
npm run dev -- --open
```

다음부터 실행할 때:

```powershell
cd frontend
npm run dev -- --open
```

브라우저가 자동으로 열립니다. 접속 주소는 터미널에 표시되며, 기본값은 `http://localhost:5173/`입니다.
React·CSS 파일을 수정하고 저장하면 화면에 반영됩니다. 서버는 터미널에서 `Ctrl+C`로 종료합니다.

| 수정할 내용 | 파일 |
|---|---|
| 화면 구성 | `frontend/src/App.jsx` |
| 화면 스타일 | `frontend/src/App.css` |
| 공통 스타일 | `frontend/src/index.css` |
| 공식 로고 | `frontend/public/brand/unigate-logo.svg` |
| 디자인 기준 | `DESIGN.md` — 디자인 변경 전에 확인 |

## 코드 검사와 빌드

아래 명령은 `frontend/`에서 실행합니다.

| 명령 | 용도 |
|---|---|
| `npm run lint` | Oxlint 코드 검사 |
| `npm run build` | `dist/`에 배포 파일 생성 |
| `npm run preview` | 빌드 결과 로컬 확인 (운영 서버 아님) |

현재 프론트엔드 테스트 스크립트는 없습니다. 백엔드는 미구현 상태이므로 백엔드 검사·마이그레이션·실행 명령도 없습니다.

## 프론트엔드 Docker 실행

Docker Desktop 또는 Docker Engine의 Linux 컨테이너 환경이 필요합니다.
프로젝트 루트에서 실행합니다.

```powershell
docker build --pull -t unigate-frontend ./frontend
docker run --rm --name unigate-frontend -p 127.0.0.1:8080:8080 unigate-frontend
```

브라우저에서 `http://localhost:8080/`에 접속합니다. 종료하려면 별도 터미널에서 `docker stop unigate-frontend`를 실행합니다.

이미지는 Node.js 24로 빌드하고 비관리자 Nginx로 HTTP 8080에서 정적 파일을 제공합니다.
`nginx.conf`는 SPA 경로 처리와 캐싱을 설정하며, `/api`와 `/api/` 하위 요청은 현재 404를 반환합니다.
HTTPS와 백엔드 프록시 연결은 향후 배포 환경에 맞게 별도로 설정해야 합니다.

## 파일 관리

- `frontend/package-lock.json`은 커밋하고 `npm ci`로 의존성을 설치합니다.
- 의존성·빌드 결과·실제 `.env*` 파일은 커밋하지 않습니다. 환경 설정을 공유할 때는 비밀 값 없는 `.example` 파일을 사용합니다.
- `.gitignore`의 Python 관련 규칙과 `backend/media/`, `backend/staticfiles/` 규칙은 향후 백엔드 작업을 위해 유지합니다. 해당 구현이나 폴더가 현재 존재한다는 의미는 아닙니다.
- 백엔드 구현이나 폴더 구조가 변경되면 `AGENTS.md`와 이 문서도 함께 갱신합니다.
