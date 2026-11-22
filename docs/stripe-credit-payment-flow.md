# TOPIQ 크레딧 충전과 Plus 구독 네트워크 흐름

[크레딧 충전](#크레딧-충전) · [Plus 구독](#plus-구독) · [결제창 재시도와 키 충돌 복구](#결제창-재시도와-키-충돌-복구) · [결제 유형별 환불·크레딧 차감 사례](stripe-credit-refund-cases.md) · [Stripe 환불 네트워크 흐름](stripe-credit-refund-flow.md)

## 크레딧 충전

로그인한 사용자가 TOPIQ의 `/credits`에서 Stripe에 등록된 원화 가격으로 결제하면 1,000크레딧을 적립한다. 예를 들어 백엔드의 `STRIPE_PRICE_ID`가 5,000원 가격을 가리키면 버튼과 Checkout 모두 5,000원을 표시한다. Django는 Stripe의 결제 완료 알림(웹훅)을 검증한 뒤 사용자의 잔액을 갱신한다.

```mermaid
sequenceDiagram
    participant B as 사용자 브라우저
    participant N as TOPIQ Next.js
    participant D as Django
    participant S as Stripe
    participant DB as PostgreSQL

    B->>N: GET /api/credits/price/
    N->>D: 충전 가격 조회
    D->>S: 설정된 Price ID로 일회성 원화 가격 조회
    S-->>D: 가격 정보
    D-->>N: Price ID, 금액, 통화, 적립량
    N-->>B: 충전 버튼에 원화 가격 표시
    B->>N: POST /api/credits/purchases/ (구매 시도 ID와 표시된 Price ID)
    N->>D: 로그인 쿠키와 CSRF 토큰을 담은 요청 전달
    D->>S: 새 주문에 사용할 가격 확인
    S-->>D: 가격 정보
    D->>DB: 주문에 회원, Price ID, 금액, 통화, 1,000크레딧 저장
    opt 회원의 Stripe 고객 ID가 없는 경우
        D->>S: 회원 전용 고객 생성
        S-->>D: Stripe 고객 ID
        D->>DB: 크레딧 계정에 고객 ID 저장
    end
    D->>S: 고객 ID와 주문의 Price ID로 Checkout 생성 (수량 1, 청구서 발행)
    S-->>D: 세션 ID와 결제창 URL
    D->>DB: 주문에 세션 ID 저장
    D-->>N: 주문 ID와 결제창 URL
    N-->>B: 주문 ID와 결제창 URL
    B->>S: Checkout으로 이동해 결제

    par 결제 완료 알림과 적립
        S->>D: POST /api/payments/stripe/webhook/
        D->>D: 서명, 주문과 세션, 결제 상태, 통화와 금액 검증
        D->>DB: 주문 완료, 잔액 +1,000, 유료 충전 내역을 함께 저장
        D-->>S: 적립 완료 또는 이미 처리한 주문이면 2xx 응답
    and TOPIQ 복귀와 결과 표시
        S-->>B: 주문 ID를 포함한 TOPIQ /credits 주소로 복귀
        B->>N: GET /api/credits/purchases/{id}/
        N->>D: 로그인한 사용자의 주문 상태 조회
        D-->>N: 대기 또는 적립 완료
        N-->>B: 대기 중에는 재조회, 완료되면 잔액과 내역 갱신
    end

    B->>N: 결제 내역 버튼 클릭
    N->>D: GET /api/credits/purchases/?page=1
    D-->>N: 회원의 일회성 주문과 환불 가능 상태
    N-->>B: 미사용 주문 전액 환불 또는 고객 문의 표시
    B->>N: Stripe 영수증 버튼 클릭
    N->>D: POST /api/credits/billing-portal/ (로그인 쿠키와 CSRF 토큰)
    D->>DB: 로그인한 회원의 Stripe 고객 ID 조회
    alt 고객 연결 완료
        D->>S: 해당 고객의 포털 세션 생성
        S-->>D: 임시 포털 URL
        D-->>N: 포털 URL
        N-->>B: 포털 URL
        B->>S: 내 청구서 조회
        S-->>B: 돌아가기 선택 시 TOPIQ /credits로 이동
    else 첫 연결 전
        D-->>N: portalUrl 값이 null
        N-->>B: 크레딧 페이지에 안내 표시
    end
```

### 결제 요청과 적립 기준

- **주문 생성.** 브라우저는 구매 시도 ID(`attemptId`)와 화면에서 확인한 `priceId`를 보낸다. 새 주문의 Price ID가 서버 설정과 달라졌으면 새 가격을 표시하고 다시 선택하도록 한다. 같은 구매 시도의 재전송에는 저장한 주문 조건을 사용한다. Stripe 세션 생성에는 주문 ID를 멱등성 키로 사용한다.
- **적립.** Stripe는 Django의 공개 HTTPS 웹훅 주소를 직접 호출한다. Django는 서명과 주문·세션 연결을 검증한 뒤, 완료된 세션의 `payment_status=paid`, 통화와 총액이 주문 시점에 저장된 값과 일치하는지 확인한다. 주문 완료, 잔액 1,000 증가, 거래 내역 생성을 같은 DB 트랜잭션으로 처리한다. 이미 적립된 주문은 중복 알림에 성공 응답만 반환한다.
- **결과 표시.** 웹훅과 브라우저 복귀는 어느 쪽이 먼저든 가능하다. 복귀 시점에 적립이 진행 중이면 주문 상태를 재조회한다. 완료되면 기존 `GET /api/credits/`와 `GET /api/credits/transactions/`로 잔액과 거래 내역을 다시 읽는다. 결제 직후 창을 닫아도 웹훅을 통해 적립된다.
- **결제 중단과 만료.** Checkout에서 결제를 취소하고 돌아오면 본인 주문 상태를 확인한다. 열린 세션은 재시도할 수 있다. Stripe가 세션 만료를 알리면 대기 주문을 만료 처리한다. 미결제 주문의 적립량은 0이다.

## Plus 구독

### 가입과 첫 결제

회원은 `/plans`에서 1개월(9,900원), 3개월(23,900원), 6개월(43,900원) 중 청구 주기를 선택한다. 결제창은 Stripe 대시보드의 결제수단 설정을 따른다. Django는 서명을 검증한 `invoice.paid` 웹훅에서 청구서의 고객·구독·가격·통화·금액을 주문과 대조한 뒤 이용 기간과 첫 달 400크레딧을 반영한다.

```mermaid
sequenceDiagram
    participant B as 사용자 브라우저
    participant N as TOPIQ Next.js
    participant D as Django
    participant S as Stripe
    participant DB as PostgreSQL

    B->>N: GET /api/plans/
    N->>D: 로그인한 회원의 플랜 조회
    D->>DB: 이용 기간과 구독 상태 조회
    D-->>N: 주기별 가격과 현재 플랜
    N-->>B: 구독 옵션 표시
    B->>N: POST /api/plans/purchases/
    N->>D: 구매 시도 ID, Price ID, 개월 수와 CSRF 토큰 전달
    D->>S: 새 주문의 반복 가격과 청구 주기 검증
    D->>DB: 중복 구독 확인 후 대기 주문 저장
    D->>S: 고객 ID와 주문 ID 키로 구독 Checkout 생성
    S-->>D: 세션 ID와 결제창 URL
    D->>DB: 주문에 세션 ID 저장
    D-->>N: 주문 ID와 결제창 URL
    N-->>B: 결제창 URL
    B->>S: Checkout에서 구독 결제
    par Stripe 웹훅
        S->>D: checkout.session.completed
        D->>DB: 주문과 세션 연결 확인
    and 결제된 청구서 웹훅
        S->>D: invoice.paid
        D->>DB: 청구서 ID 기준으로 이용 기간과 첫 달 400크레딧을 한 번 반영
    and 브라우저 복귀
        S-->>B: /plans?purchase={id}로 복귀
        B->>N: GET /api/credits/purchases/{id}/?product=plan
        N->>D: 본인 주문 상태 조회
        D-->>N: 대기 또는 완료
        N-->>B: 대기 중이면 재조회하고 완료되면 플랜 갱신
    end
```

### 갱신과 해지

```mermaid
sequenceDiagram
    participant B as 사용자 브라우저
    participant N as TOPIQ Next.js
    participant D as Django
    participant S as Stripe
    participant DB as PostgreSQL

    S->>D: 갱신 결제 성공 시 invoice.paid
    D->>DB: 새 청구서 ID와 결제한 이용 기간 저장
    B->>N: 크레딧 잔액·내역 조회 또는 사용
    N->>D: 크레딧 요청 전달
    D->>DB: 지급일이 지난 미지급 월마다 400크레딧 적립
    opt 회원이 기간 종료 시 해지 선택
        B->>N: 구독 관리 및 해지 열기
        N->>D: POST /api/credits/billing-portal/ (from=plans)
        D->>S: 회원의 고객 포털 세션 생성
        S-->>D: 포털 URL
        D-->>N: 포털 URL
        N-->>B: 포털 URL
        B->>S: 포털에서 기간 종료 시 해지 예약
        S->>D: customer.subscription.updated
        D->>S: 최신 구독 상태 조회
        D->>DB: 해지 예정 상태 저장
        S->>D: 기간 종료 시 customer.subscription.deleted
        D->>DB: 구독 종료 상태 저장
    end
```

갱신 청구서가 다음 기간 시작 전에 도착해도 그 기간의 첫 400크레딧은 시작일이 되어야 지급 대상이 된다. 갱신 결제가 실패하거나 해지를 예약해도 이미 결제한 기간의 종료일까지 Plus를 이용할 수 있다.

### 결제창 재시도와 키 충돌 복구

같은 구독 주문에 세션 ID가 저장돼 있으면 Django는 그 세션을 직접 조회한다. 아래는 세션 ID가 없는 대기 주문을 생성 후 23시간 이내에 재시도하는 흐름이다. 23시간을 넘기면 기존 세션 복구만 시도하며, 조회에 성공해도 세션이 없으면 주문을 만료 처리한다.

```mermaid
flowchart TD
    Retry{"기존 주문 ID 키로 Checkout 생성 재시도"} -->|성공| State{"세션 상태"}
    Retry -->|키 사용 중| Stop["503 반환, 해당 요청 중단"]
    Retry -->|키의 파라미터 불일치| Lookup["Stripe에서 같은 고객의 세션을 조회하고 주문 ID 대조"]
    Lookup -->|조회 실패| Stop
    Lookup -->|기존 세션 발견| State
    Lookup -->|일치하는 세션 없음| Check{"DB에서 주문 다시 확인"}
    Check -->|다른 요청이 세션 ID 저장| Fetch["저장된 세션을 Stripe에서 조회"]
    Fetch --> State
    Check -->|세션 ID 없음, 주문 처리 종료| Done["현재 주문 상태 반환"]
    Check -->|세션 ID 없음, 대기 중| Create["주문별 고정 복구 키로 Checkout 생성"]
    Create -->|생성 성공| State
    State -->|open| Open["대기 주문에 연결된 결제창 URL 반환"]
    State -->|complete| Complete["결제창 URL 없이 주문 상태 반환, 적립은 invoice.paid에서 처리"]
    State -->|expired| Expired["대기 주문 만료 처리"]
```

복구 키는 `{주문 ID}-subscription-v2`다. 응답이 유실되거나 두 요청이 동시에 복구를 시도해도 같은 주문에는 같은 키를 쓴다. Stripe가 키 사용 중(`idempotency_key_in_use`)이라고 응답하면 Django는 503을 반환하고 해당 요청에서 복구 키로 새 세션을 만들지 않는다.

구독 흐름의 구현은 [결제창 생성과 재시도](../backend/accounts/payments.py), [청구서와 구독 웹훅](../backend/accounts/subscriptions.py), [월별 크레딧 지급](../backend/accounts/credits.py)에서 확인할 수 있다.

관련 자료는 [TOPIQ의 기존 API 전달 설정](../frontend-TOPIQ/next.config.ts), [기존 크레딧 모델](../backend/accounts/models.py), [Stripe Checkout 결제 완료 처리](https://docs.stripe.com/checkout/fulfillment)에서 확인할 수 있다.
