# TOPIQ Google 로그인 네트워크 흐름

이 흐름도는 이미 Google 계정을 연결한 회원이 TOPIQ에 다시 로그인하는 과정을 보여 준다.

```mermaid
sequenceDiagram
    actor U as 사용자
    participant B as 브라우저의 TOPIQ 화면
    participant G as Google
    participant N as TOPIQ Next.js
    participant D as Django
    participant DB as 데이터베이스

    B->>N: POST /api/auth/google/start/ (CSRF 헤더)
    N->>D: 로그인 준비 요청과 쿠키 전달
    D->>D: 일회용 값(nonce)을 생성해 현재 세션에 보관
    D-->>N: nonce와 세션 쿠키
    N-->>B: 응답 전달
    U->>B: Google로 계속하기 클릭
    B->>G: TOPIQ 클라이언트 ID와 nonce로 로그인 창 열기
    U->>G: 계정 선택 및 필요한 인증
    G->>G: 요청의 nonce를 담은 ID 토큰에 Google의 개인키로 서명
    G-->>B: 서명된 ID 토큰 반환

    B->>N: POST /api/auth/google/ (ID 토큰, CSRF 헤더)
    N->>D: 요청과 세션 쿠키 전달
    D->>D: 현재 세션에서 일회용 nonce를 꺼내 재사용 차단
    opt 검증용 공개키 캐시를 갱신할 때
        D->>G: 공개키 요청
        G-->>D: Google 공개키 반환
    end
    D->>D: Google 공개키로 ID 토큰의 서명 검증
    D->>D: 발급자, 대상 앱, 만료 시간 확인
    D->>D: 토큰 속 nonce와 현재 세션에서 꺼낸 nonce가 일치하는지 확인
    D->>DB: Google 계정 ID(sub)로 연결된 활성 회원 조회
    DB-->>D: TOPIQ 회원 ID
    D-->>N: 로그인 세션 쿠키, 회원 정보, 새 CSRF 토큰
    N-->>B: 쿠키와 응답 전달
    B->>N: 세션 쿠키로 시험 또는 크레딧 조회
    N->>D: 해당 API로 요청 전달
```

사용자는 Google 로그인 창에서 본인 인증을 마친다. Django는 Google의 서명과 이번 로그인 요청의 일회용 값(`nonce`)을 검증하고, 토큰에 담긴 Google 계정 ID(`sub`)로 TOPIQ 회원을 찾는다. 로그인 후 브라우저는 Django가 발급한 세션 쿠키로 시험과 크레딧 API를 이용한다.

처음 Google로 로그인하면 Django가 검증 결과를 브라우저 세션에 15분간 보관하고 다음 단계를 안내한다.

- **기존 이메일 회원**은 연결할 이메일을 확인하고 TOPIQ 비밀번호를 입력한다. 브라우저가 `POST /api/auth/google/link/`를 보내면 Django는 비밀번호를 검증하고 해당 회원 ID에 Google 계정을 연결한다. 이후 같은 회원의 시험 기록과 크레딧을 이용한다.
- **신규 회원**은 닉네임·학습 설문·개인정보 동의를 입력한다. Google이 소유권을 보증하는 검증된 Gmail·Workspace 주소 외에는 같은 브라우저에서 TOPIQ 인증 메일을 확인한다. 마지막 `POST /api/auth/google/signup/` 요청에서 회원·연결·설문·가입 크레딧을 함께 저장한 뒤 로그인한다.
