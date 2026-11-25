# TOPIQ 이메일·비밀번호 로그인 네트워크 흐름

브라우저는 TOPIQ와 같은 출처의 API를 호출하고, Next.js는 요청을 Django로 전달한다. **Google로 계속하기**를 선택했을 때의 요청은 [Google 로그인 흐름도](google-login-flow.md)에서 볼 수 있다.

## 1. 로그인 화면에서 기존 세션 확인

`/login`을 직접 열면 TOPIQ는 먼저 로그인 상태를 확인한다. 이미 앱 안에서 로그인 상태를 확인했다면 그 결과를 사용한다.

```mermaid
sequenceDiagram
    participant B as 브라우저
    participant N as TOPIQ Next.js
    participant D as Django

    B->>N: GET /api/auth/me/
    N->>D: 세션 쿠키가 있으면 함께 전달
    alt 유효한 로그인 세션
        D-->>N: 200 · 회원 정보
        N-->>B: 회원 정보 전달
        B->>B: next 경로로 이동 (기본값 /)
    else 비로그인 또는 세션 만료
        D-->>N: 401 · authentication_required
        N-->>B: 401 전달
        B->>B: 이메일·비밀번호 입력 폼 표시
    end
```

## 2. 비밀번호 확인과 세션 발급

```mermaid
sequenceDiagram
    participant B as 브라우저
    participant N as TOPIQ Next.js
    participant D as Django
    participant DB as PostgreSQL

    opt 브라우저 메모리에 CSRF 토큰이 없을 때
        B->>N: GET /api/csrf/
        N->>D: 토큰 요청 전달
        D-->>N: csrfToken과 csrftoken 쿠키
        N-->>B: 토큰과 쿠키 전달
    end
    B->>N: POST /api/auth/login/ (이메일, 비밀번호)
    N->>D: 본문, 쿠키, X-CSRFToken 헤더 전달
    D->>D: CSRF와 입력값 검증, 이메일 정규화
    D->>DB: 해당 이메일의 로그인 실패 횟수와 제한 만료 시각 조회
    alt 시도 제한 중
        D-->>N: 429 · rate_limited
        N-->>B: 429와 Retry-After 헤더 전달
    else 시도 가능
        D->>DB: 이메일로 회원 조회
        D->>D: 계정 활성 상태와 비밀번호 확인
        alt 인증 성공
            D->>DB: 실패 기록 삭제, 로그인 세션 저장
            D-->>N: 200 · 회원 정보, 새 CSRF 토큰, 세션·CSRF 쿠키
            N-->>B: 응답 본문과 Set-Cookie 전달
            B->>B: 로그인 상태 갱신 후 next 경로로 이동
        else 인증 실패
            D->>DB: 실패 횟수 기록
            D-->>N: 401 · invalid_credentials
            N-->>B: 401 전달
            B->>B: 로그인 폼에 오류 표시
        end
    end
```

- **세션 유지** — 성공 응답의 `user`로 화면을 갱신한다. 이후 요청에는 브라우저가 `sessionid` 쿠키를 보내고, CSRF 검사가 필요한 요청에는 프런트엔드가 새 토큰을 `X-CSRFToken` 헤더에 넣는다.
- **화면 복귀** — 로그인 화면의 `next`가 허용된 내부 경로이면 그곳으로 이동한다. 값이 없거나 유효하지 않으면 홈(`/`)으로 이동한다.
- **CSRF 재시도** — Django가 `403 csrf_failed`를 반환하면 브라우저는 갱신된 토큰으로 로그인 요청을 한 번 재시도한다.
- **로그인 시도 제한** — 같은 이메일로 5분 안에 5회 실패하면 제한 시간이 끝날 때까지 다음 요청에 `429`를 반환한다. `Retry-After`는 다시 시도할 수 있을 때까지 남은 초다.
