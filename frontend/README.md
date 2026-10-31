# Unigate Frontend

Next.js App Router, React, TypeScript, Tailwind CSS v4 프론트엔드입니다.
운영 빌드는 `out/`에 정적 파일을 생성합니다. Node.js 24와 npm을 사용합니다.

## 개발

`frontend/`에서 `npm ci`, `npm run dev`를 실행합니다.
브라우저는 `NEXT_PUBLIC_BACKEND_URL`의 Django API를 직접 호출합니다.
개발 기본값은 `http://localhost:8000`입니다. 프론트도 `http://localhost:3000`으로 접속하세요.
127.0.0.1을 사용하려면 양쪽 모두 같은 호스트명을 사용하고 환경변수를 지정하세요.

## 빌드와 배포

PowerShell에서 공개 백엔드 주소를 설정하고 빌드합니다.

```powershell
$env:NEXT_PUBLIC_BACKEND_URL="https://api.example.com"
npm run lint
npm run typecheck
npm run build
npm run preview
```

또는 `.env.production.example`을 `.env.production`으로 복사하고 실제 주소를 입력합니다.
`preview`는 `out/`를 포트 3000에서 제공하는 정적 서버이며 API 프록시는 없습니다.

Docker는 저장소 루트에서 실행합니다.

```sh
docker build --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com -t unigate-frontend frontend
docker run --rm -p 8080:8080 unigate-frontend
```

Nginx 기본 실행 명령으로 정적 파일만 제공합니다. 별도 시작 shell이나 API 프록시가 없습니다.
배포 시 소스 디렉터리는 `frontend`, 서비스 포트는 `8080`입니다.
`NEXT_PUBLIC_BACKEND_URL`은 **빌드 인자**로 전달해야 합니다. 컨테이너 런타임 환경변수만 설정하면 반영되지 않습니다.
주소는 브라우저에서 접근 가능한 HTTP(S) origin이며 `/api` 경로는 붙이지 않습니다. 운영에서는 HTTPS를 사용하세요.
주소가 정적 JavaScript에 포함되므로 비밀 값을 넣지 말고, 변경하면 다시 빌드하세요.

백엔드에는 `DJANGO_ALLOWED_HOSTS`로 백엔드 호스트명을, `DJANGO_CSRF_TRUSTED_ORIGINS`로 프론트 origin을 지정합니다.
후자는 CORS 허용 목록으로도 사용합니다. 정확한 origin만 허용하며 와일드카드는 사용하지 않습니다.
CSRF 보호는 유지됩니다. 서로 다른 사이트 간 쿠키를 차단하는 브라우저에서는 설문 제출이 제한될 수 있습니다.

전체 백엔드·저장소 설정은 [프로젝트 README](../README.md)를 참고하세요.
디자인 변경 전에는 [DESIGN.md](../DESIGN.md)를 확인하세요.
