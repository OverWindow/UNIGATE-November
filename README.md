# UNIGATE

한국 대학 편입 안내 PDF 신청을 받는 인도네시아어 프로모션 랜딩페이지입니다.
단일 페이지에서 안내 콘텐츠, 비용 비교, 대학 갤러리와 통계 팝업을 제공하고, PDF 신청 정보를 PostgreSQL에 저장합니다.
PDF 파일은 운영자가 나중에 수동으로 보냅니다. 이 랜딩페이지에는 자동 다운로드·메일 발송·회원가입·이용자 로그인·결제·백그라운드 작업이 없습니다. 별도 TOPIQ의 인증 기능은 공유 백엔드에 유지합니다.

## TOPIQ Google 로그인

TOPIQ는 Google Identity Services 팝업에서 받은 ID 토큰을 Django에서 검증하고 기존 로그인 세션을 발급합니다. 기존 이메일 회원은 TOPIQ 비밀번호를 확인한 뒤 연결합니다. 신규 회원은 닉네임·학습 설문·개인정보 동의를 제출하면 가입 크레딧 100개를 받습니다. Google에서 이메일 소유권을 확인할 수 없는 주소는 가입을 시작한 브라우저에서 TOPIQ 인증 메일 링크를 열어야 합니다. [네트워크 흐름도](docs/google-login-flow.md)

1. Google Auth Platform에서 서비스 이름·지원 이메일·대상을 설정하고 **웹 애플리케이션** 유형의 OAuth 클라이언트를 만듭니다. 승인된 JavaScript 원본에 개발 환경의 `http://localhost`, `http://localhost:3001`과 운영 환경의 `https://topiq.unigate.kr`을 해당 클라이언트별로 등록합니다. 테스트 게시 상태이면 테스트 사용자도 등록합니다. [Google 웹 설정](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
2. Django의 로컬 `.env.development` 또는 운영 환경 변수에 해당 환경의 공개 웹 클라이언트 ID를 `GOOGLE_CLIENT_ID`로 설정합니다. 버튼은 기존 Next.js 프록시를 통해 이 ID를 받습니다. 값을 비우면 Google 로그인이 비활성화됩니다. 외부 이메일 가입에는 기존 Brevo 발송 설정을 사용합니다.
3. **로컬**에서는 코드 반영 후 서버 시작 전에 사용자가 `backend/`에서 다음 명령을 순서대로 실행합니다. 첫 명령은 가상 환경에 검증 라이브러리를 설치하고, 두 번째는 DB 마이그레이션을 적용합니다. `accounts.0008_googleidentity`는 회원 참조 기본 키 `user_id`와 고유 Google 식별자 `google_sub`를 갖는 `accounts_googleidentity` 테이블을 추가합니다. 세 번째 명령은 개발 서버를 시작합니다.

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe manage.py migrate
   .\.venv\Scripts\python.exe manage.py runserver
   ```

4. 별도 터미널의 `frontend-TOPIQ/`에서 `npm run dev`를 실행한 후 `http://localhost:3001/login`에서 실제 Google 팝업을 확인합니다. 개발용 Google 계정으로 신규 가입, 기존 이메일 회원 연결, 로그아웃 후 재로그인과 크레딧 잔액을 확인합니다. **운영**은 환경 변수 설정 후 백엔드와 TOPIQ 프론트엔드를 배포합니다. 백엔드 시작 스크립트가 Gunicorn 실행 전에 마이그레이션을 자동 적용합니다.

인증 회귀 테스트는 `backend/`에서 `.\.venv\Scripts\python.exe manage.py test accounts --noinput`으로 실행합니다. Django가 별도 PostgreSQL 테스트 DB를 생성·삭제하며, Google 토큰 검증에는 테스트용 서명과 공개키를 사용합니다. 프론트엔드 검증은 `frontend-TOPIQ/`에서 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`를 실행합니다.

## TOPIQ Plus

헤더의 닉네임 옆에서 Free 또는 Plus 상태를 확인합니다. **아이디 → Plus**에서 현재 카드는 ‘내 플랜’으로 표시되며 1·3·6개월 구독을 확인할 수 있습니다. Stripe는 선택한 주기마다 자동 결제하고, 결제한 이용 기간 동안 매월 400크레딧을 누적 지급합니다. Plus 회원은 모든 공개 PBT·IBT 읽기·듣기 모의고사에 응시할 수 있습니다. 쓰기는 Free·Plus 모두 세트당 100크레딧으로 해제하며, 해제한 세트에는 재열람과 문항당 최대 20회의 AI 첨삭이 포함됩니다.

| Plus 결제 주기 | 가입 시 | 주기당 결제액 | 백엔드 환경변수 |
| --- | --- | --- | --- |
| 매월 | 7일 무료 체험 | 9,900원 | `STRIPE_PLAN_PRICE_ID_1M` |
| 3개월마다 | 즉시 결제 | 23,900원 | `STRIPE_PLAN_PRICE_ID_3M` |
| 6개월마다 | 즉시 결제 | 43,900원 | `STRIPE_PLAN_PRICE_ID_6M` |

**월간 무료 체험.** Stripe에 카드를 직접 등록한 뒤 TOPIQ에서 유료 전환 예정 일시, 월 9,900원, 등록 카드 자동결제와 해지 방법을 확인하고 동의하면 Plus가 시작됩니다. 체험 중에는 Plus 모의시험·단어장을 이용합니다. 첫 실제 결제가 성공하면 첫 400크레딧을 지급합니다. 구독 관리에서 해지를 예약하면 체험 종료일까지 이용하고 첫 청구는 0원입니다. 첫 결제에 실패하면 체험 종료 시 권한이 만료되고 결제 성공 후 유료 기간이 반영됩니다.

체험은 계정과 카드 각각 한 번입니다. 과거 3·6개월권을 사용한 회원도 기존 구독과 이용 기간이 끝났고 계정·카드에 체험 이력이 없으면 신청할 수 있습니다. 체험을 사용한 계정은 구독 해지 후 3·6개월권으로 재가입할 수 있습니다. 카드 등록을 중단했거나 최종 동의를 하지 않았다면 체험 기회를 유지합니다. Apple Pay·Google Pay 등 지갑형 결제수단은 체험 신청 시 카드 직접 입력으로 다시 등록해 주세요. [체험 정책과 가입 흐름](docs/topiq-plus-trial-plan.md)

동의 화면에 표시하는 전환 예정 시각은 다음 5분 경계에서 7일 뒤입니다. 같은 조건으로 확인할 수 있는 시간이 지나면 새 일시로 다시 동의를 받습니다. Stripe에는 사용자가 확인한 시각을 그대로 전달합니다.

**월간 체험 배포 순서**

1. 샌드박스와 운영의 비밀 설정에 환경마다 별도로 생성한 무작위 비밀값 `STRIPE_TRIAL_FINGERPRINT_KEY`를 등록합니다. 같은 환경의 모든 백엔드 인스턴스와 재배포에서 값을 유지해야 이전 카드 기록과 동일한 HMAC을 계산할 수 있습니다. 각 환경에서 Stripe 키와 세 가지 반복 가격이 같은 계정·모드에 속하는지도 확인합니다. 제한 키를 사용하면 Checkout 세션, SetupIntent·결제수단 조회, 구독 생성·조회와 기존 결제 권한이 필요합니다.
2. 기존 Stripe 웹훅 주소에 `customer.subscription.created`를 추가하고 고객 포털의 취소 시점을 **현재 결제 기간 종료 시**로 설정합니다. 로컬 전달 명령은 아래 ‘로컬에서 테스트 결제하기’에 있습니다.
3. 개발에서는 사용자가 `backend/`에서 서버 시작 전에 `.\.venv\Scripts\python.exe manage.py migrate`를 실행합니다. 운영은 기존 시작 스크립트가 Gunicorn 시작 전 자동 적용합니다. `accounts.0014_plus_free_trials`가 체험 원주문·계정·카드 비교값·상태·동의·체험 기간을 저장하는 `plus_free_trials`를 만들고 `credit_purchases`의 열린 구독 제약에 `trialing`을 포함합니다.
4. **백엔드 교체가 끝나고 새 프론트를 공개하기 전**, 로컬에서는 `backend/`에서 `.\.venv\Scripts\python.exe manage.py expire_legacy_monthly_checkouts`, 운영에서는 배포된 백엔드 컨테이너의 `/app/backend`에서 `python manage.py expire_legacy_monthly_checkouts`를 **한 번 수동 실행**합니다. 구버전의 열려 있는 월간 즉시 결제창을 Stripe에서 만료시키고 해당 DB 주문을 만료 처리합니다. 이미 완료된 결제는 기존 웹훅으로 정산합니다. 중단 시 같은 명령으로 재시도할 수 있습니다. 새 체험 신청, 장기권, 이용 중인 구독에는 적용되지 않습니다.
5. TOPIQ 프론트를 배포합니다. 샌드박스에서 월간 카드 등록 → 동의 → 구독 관리 → 첫 결제 또는 해지를 확인합니다. 두 계정에서 같은 카드를 등록하면 한 계정만 체험을 시작할 수 있습니다. [Stripe Billing 테스트](https://docs.stripe.com/billing/testing)

- **Stripe 설정.** 샌드박스와 라이브 모드에서 각각 KRW 정액 반복 가격 3개를 생성합니다. 월 단위 간격을 각각 1·3·6으로 설정하고 새 Price ID를 위 환경변수에 지정합니다. 1,000크레딧 충전용 `STRIPE_PRICE_ID`는 일회성 가격을 사용합니다. 기본 고객 포털에서 결제 수단 변경, 청구서 조회, **현재 결제 기간 종료 시 구독 취소**를 활성화합니다. 포털의 상품·수량 변경은 끕니다. [Stripe 고객 포털 설정](https://docs.stripe.com/customer-management/configure-portal)
- **웹훅.** 아래 로컬 CLI 명령과 운영 Workbench 엔드포인트에 동일한 이벤트를 등록합니다. Checkout 완료·만료는 결제창 상태를, `invoice.paid`는 해당 청구 기간의 권한을, 구독 변경·삭제는 갱신 상태를 반영합니다. 구독 첫 결제가 확인되면 첫 달 400크레딧을 즉시 지급합니다. 환불 이벤트는 해당 청구 회차의 크레딧을 정산합니다. 다음 결제가 실패하면 마지막으로 결제한 기간까지만 이용할 수 있습니다.
- **월별 적립.** 이후 지급일은 각 결제 기간의 시작 일시를 한국 시간으로 보고 한 달씩 더해 계산합니다. 해당 날짜가 없는 달에는 말일을 적용합니다. 잔액·내역 조회 또는 크레딧 사용 시 지급일이 지난 달마다 400개를 한 번씩 기록합니다. 만료 후 돌아와도 이미 결제한 기간의 미지급분과 남은 잔액을 사용할 수 있습니다. 별도 워커나 정기 실행 명령은 필요하지 않습니다.
- **API와 DB.** 기존 `GET /api/plans/`, `POST /api/plans/purchases/`, 청구 포털 및 웹훅 경로를 사용합니다. `accounts.0010_recurring_plus`가 `credit_purchases`에 구독 원주문의 Stripe ID(`stripe_subscription_id`), 갱신 상태(`subscription_state`), 결제 회차의 고유 청구서 ID(`stripe_invoice_id`)를 추가합니다. 이미 결제한 일회성 이용권은 기존 만료일까지 유효하며 만료 후 직접 구독할 수 있습니다.
- **적용.** 개발에서는 사용자가 백엔드 설정 후 서버를 시작하기 전에 `backend/`에서 `.\.venv\Scripts\python.exe manage.py migrate`를 수동 실행합니다. 운영에서는 세 가격·포털·웹훅 설정을 마치고 백엔드와 TOPIQ를 배포합니다. 기존 `deploy/start.sh`가 Gunicorn 시작 전에 마이그레이션을 자동 적용합니다.
- **월별 적립 스키마.** `accounts.0011_creditpurchase_credited_months`는 `credit_purchases.credited_months`에 결제 회차별 지급 완료 개월 수를 기록합니다. `GET /api/plans/`의 `currentPlanMonths`는 현재 유효한 이용권의 개월 수이고, 무료 계정은 `null`입니다.
- **구독 관리.** 설정 → 구독 관리(`/settings/subscription`)에서 내 상품, 결제 주기, 이용 가능 기한과 갱신 상태를 확인합니다. `GET /api/subscriptions/me/`는 로그인한 회원의 정보와 Stripe 고객 연결 여부(`canOpenBillingPortal`)를 반환합니다. 연결된 회원은 **결제 관리**에서 결제 수단을 관리하고 정기 구독의 자동 갱신을 해지할 수 있습니다. Stripe 연결이 없는 회원과 무료 회원에게는 **요금제 보기** 버튼을 표시합니다.
- **결제 주기 변경.** 자동 갱신 중인 Plus 회원은 요금제 화면에서 1개월을 3개월 또는 6개월로, 3개월을 6개월로 변경할 수 있습니다. 확인 화면에서 다음 결제일과 금액을 확인하고 예약합니다. 예를 들어 1개월에서 3개월로 예약하면 당일 청구액은 0원이고, 다음 결제일에 23,900원을 결제합니다. 적용 전에는 구독 설정에서 예약을 취소할 수 있으며 기존 주기로 계속 갱신됩니다. 예약 중에 자동 갱신 자체를 해지하려면 예약을 먼저 취소하고 **결제 관리**를 엽니다.
- **예약 API와 운영 설정.** `POST /api/subscriptions/me/plan-change/`는 변경을 예약하고 같은 경로의 `DELETE`는 예약을 취소합니다. `GET /api/plans/`와 `GET /api/subscriptions/me/`에서 예약한 주기와 적용일을 조회합니다. Stripe가 기존 구독의 결제 주기를 전환하고 TOPIQ는 결제된 회차를 기존 구매 테이블에 기록합니다. 제한된 Stripe API 키를 사용하는 경우 구독 일정(Subscription Schedules)의 읽기·쓰기 권한이 필요합니다. 이 기능 전용 마이그레이션이나 정기 실행 명령은 없습니다. [Stripe 구독 일정](https://docs.stripe.com/billing/subscriptions/subscription-schedules)
- **확인.** Stripe 샌드박스에서 첫 결제와 갱신 후 각각 청구 기간과 **플랜 지급 +400**을 확인합니다. 같은 청구서 이벤트를 다시 전송해 지급 횟수를 확인합니다. **설정 → 구독 관리**에서 해지한 뒤 기간 종료 시 Free로 돌아가는지 확인합니다.

## TOPIQ 크레딧 충전

TOPIQ 회원은 `/credits`에서 Stripe Checkout 카드 결제로 1,000크레딧을 충전합니다. 버튼에 표시하는 원화 금액과 결제창의 가격은 백엔드 환경변수 `STRIPE_PRICE_ID`로 지정합니다. Django가 결제를 확인하면 잔액과 거래 내역에 `유료 충전 +1,000`을 함께 기록합니다. 브라우저를 닫아도 Stripe 웹훅이 적립을 처리합니다. [수정 가능한 결제 흐름도](docs/stripe-credit-payment-flow.md)

Checkout에 표시할 결제수단은 Stripe Dashboard에서 관리합니다. 테스트 결제 전에는 샌드박스에서, 운영 전환 전에는 라이브 모드에서 TOPIQ Checkout에 적용되는 기본 결제수단 구성에 **카드(Cards)만 활성화**되어 있는지 확인하세요. 현재 크레딧 적립은 즉시 승인되는 카드 결제를 기준으로 동작합니다. [Stripe 결제수단 설정](https://dashboard.stripe.com/settings/payment_methods) · [Checkout 전환 가이드](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods)

| 메서드 | API | 용도 |
| --- | --- | --- |
| GET | `/api/credits/price/` | 로그인한 회원에게 현재 충전 가격(Price ID·금액·통화)과 적립량 제공 |
| POST | `/api/credits/purchases/` | 로그인·CSRF 인증 후 구매 시도 ID와 화면에서 확인한 Price ID로 주문·결제 세션 생성 |
| GET | `/api/credits/purchases/?page=1` | 본인의 적립 완료 일회성 충전 주문, 잔여 크레딧 및 환불 가능 상태 조회 |
| POST | `/api/credits/purchases/<id>/refund/` | 로그인·CSRF 인증 후 해당 미사용 주문의 실결제액 전액 환불 또는 접수 확인 |
| GET | `/api/credits/purchases/<id>/` | 로그인한 사용자의 주문 상태 조회 |
| POST | `/api/credits/billing-portal/` | 로그인·CSRF 인증 후 본인 전용 Stripe 고객 포털 주소 발급. 고객 연결 전에는 `portalUrl: null` 반환 |
| POST | `/api/payments/stripe/webhook/` | Django가 Stripe 서명을 확인하고 결제·구독·환불 이벤트 처리 |

`backend/migration/accounts/`의 Django 마이그레이션이 결제 스키마를 관리합니다. `credit_purchases`에는 주문·회원·구매 시도(`id`, `user_id`, `attempt_id`), 주문 당시의 가격과 지급량(`stripe_price_id`, `amount`, `currency`, `credits`), 처리 상태와 생성 시각(`status`, `created_at`), Stripe 세션과 적립 내역(`stripe_session_id`, `transaction_id`)을 기록합니다. Django가 주문을 생성할 때 Stripe에서 읽은 금액을 저장하고, 적립 시 `credit_transactions.kind`에 유료 충전(`purchase`)을 기록합니다.

**일회성 크레딧 환불.** TOPIQ 하단의 **설정 → 일회성 크레딧 환불**에서 환불 규정을 볼 수 있습니다. 로그인하면 **내 충전 주문**에 결제액과 남은 크레딧이 표시됩니다. 유료 충전분은 먼저 적립된 주문부터 사용합니다. 한 주문의 크레딧이 모두 남아 있으면 **전액 환불**을 선택해 금액을 확인합니다. 일부 사용했거나 이전 기록만으로 사용량을 확인하기 어려우면 **고객 문의**를 누릅니다. 팝업에서 `billing@unigate.kr`와 해당 주문번호를 각각 복사한 뒤, 평소 사용하는 메일에서 주문번호와 문의 내용을 적어 보내세요. 일회성 청구서에는 별도 발행 수수료가 적용됩니다. [Stripe 청구서 발행 요금](https://support.stripe.com/questions/pricing-for-post-payment-invoices-for-one-time-purchases-via-checkout-and-payment-links)

**Stripe 포털 설정.** 테스트 전에 샌드박스에서, 배포 전에 라이브 모드에서 각각 기본 고객 포털의 **Invoice history**를 켜고 설정을 저장합니다. API가 회원별로 임시 포털 세션을 생성하므로 공개 로그인 링크를 만들 필요는 없습니다. 테스트와 운영은 각 Stripe 환경에 대응하는 별도 DB를 사용합니다. [고객 포털 설정](https://dashboard.stripe.com/settings/billing/portal)

### 로컬에서 테스트 결제하기

1. **상품 가격과 백엔드 설정.** Stripe 샌드박스의 상품 카탈로그에서 1,000크레딧 상품의 활성 일회성 고정 가격을 선택합니다. 처음 등록한다면 통화는 KRW, 금액은 5,000원으로 설정합니다. 가격의 `price_...` 값을 `backend/.env.development`의 `STRIPE_PRICE_ID`에, 같은 샌드박스의 API 비밀 키를 `STRIPE_SECRET_KEY`에 설정합니다. `TOPIQ_PUBLIC_URL`은 브라우저에서 여는 TOPIQ 주소와 맞춥니다(로컬 기본값 `http://localhost:3001`). [Stripe 상품·가격 관리](https://docs.stripe.com/products-prices/manage-prices)
2. **웹훅 전달.** Stripe CLI를 설치한 뒤 별도 터미널에서 아래 명령을 수동 실행합니다. 리스너가 표시한 이 환경의 서명 키를 `backend/.env.development`의 `STRIPE_WEBHOOK_SECRET`에 설정하고 테스트 중에는 리스너를 실행해 둡니다. 전달 대상은 Django 개발 서버입니다. [Stripe CLI 설치](https://docs.stripe.com/cli/install) · [웹훅 전달](https://docs.stripe.com/cli/listen)

   ```powershell
   stripe login
   stripe listen --events checkout.session.completed,checkout.session.expired,invoice.paid,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,refund.created,refund.updated,refund.failed --forward-to http://localhost:8000/api/payments/stripe/webhook/
   ```

3. **패키지와 DB 적용.** 사용자가 `backend/`에서 개발 서버 시작 전에 아래 명령을 차례로 실행합니다. 첫 명령은 기존 의존성을 설치합니다. 두 번째 명령은 회원의 Stripe 고객 ID 컬럼을 추가하는 `accounts.0007_credit_account_stripe_customer`를 포함하여 미적용 DB 마이그레이션을 적용합니다.

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe manage.py migrate
   .\.venv\Scripts\python.exe manage.py runserver
   ```

4. **확인.** 다른 터미널의 `frontend-TOPIQ/`에서 `npm run dev`를 실행합니다. `http://localhost:3001/credits`에서 로그인해 버튼과 Checkout에 같은 원화 금액이 표시되는지 확인합니다. 테스트 카드로 결제한 뒤 잔액과 거래 내역에 1,000크레딧이 한 번 반영되는지 확인합니다. [Stripe 테스트 카드](https://docs.stripe.com/testing)
5. **결제 내역 확인.** 샌드박스에서 한 회원으로 두 번 충전한 뒤 쓰기 세트 하나를 처음 엽니다. 첫 주문은 **고객 문의**, 두 번째 주문은 **전액 환불**이 표시됩니다. 두 번째 주문을 환불하고 결제 금액과 회수한 수량을 대조합니다. 다른 회원으로 로그인해 첫 회원의 주문이 보이지 않는지 확인합니다.

로컬에서는 개발 서버를 다시 시작하기 전에 사용자가 `backend/`에서 `.\.venv\Scripts\python.exe manage.py migrate`를 수동 실행합니다. 운영에서는 기존 `deploy/start.sh`가 Gunicorn 시작 전에 자동 적용합니다. `accounts.0013_paid_credit_allocation`은 `credit_purchases`에 주문 잔여량(`remaining_credits`), 진행 중인 환불의 재시도 식별자(`refund_attempt_id`), 운영 확인 필요 여부(`refund_review_required`), 환불 실패 시 원래 지급처에 돌려줄 차감 내역(`refund_sources`)을 추가합니다. 기존 지갑·원장·Stripe 결제 금액은 보존하며, 원장과 잔액을 대조할 수 있는 주문의 잔여량을 복원합니다.

환불을 접수하면 해당 주문의 크레딧을 보류합니다. 통신이 끊기면 결제 내역의 **환불 접수 확인**으로 같은 요청을 이어갑니다. Stripe가 처리를 확인한 주문은 **환불 처리 중**으로 표시하고, 결제 내역을 열어 두면 상태를 갱신합니다. 성공하면 크레딧을 회수하고, 실패·취소하면 보류를 해제합니다.

결제 회귀 테스트는 서비스 DB와 분리된 PostgreSQL 연결 설정에서 `backend/`의 `.\.venv\Scripts\python.exe manage.py test accounts.tests.test_credit_purchases accounts.tests.test_credit_refunds --noinput`으로 실행합니다. Django가 테스트 DB를 만들고 삭제하며, 테스트용 Stripe 응답과 서명된 웹훅으로 중복 지급·차감, 동시 처리, 실패 복원과 월별 정산을 검증합니다.

### Stripe 대시보드 환불

운영자는 Stripe의 **Payments → 해당 결제 → Refund payment**에서 전액 또는 부분 환불합니다. TOPIQ는 성공한 환불액을 주문별로 합산하고, `지금까지 지급한 크레딧 × 누적 성공 환불액 ÷ 주문 당시 실결제액`의 정수 부분만큼 회수합니다. 여러 번 나눠 환불해도 누적 차감량은 같습니다. Plus는 일부·전액 환불이 성공하면 즉시 권한을 종료하고 Stripe 구독을 중단합니다. 남은 이용 기간의 월별 크레딧 지급도 종료합니다. 종료된 권한은 환불 실패 알림만으로 자동 복구하지 않습니다. [Stripe 환불 안내](https://docs.stripe.com/refunds)

예약 중인 크레딧은 보호합니다. 가용 잔액까지만 회수하고 부족분은 소멸시킵니다. 이후 적립 또는 예약 해제된 크레딧에서는 재차감하지 않습니다. 부족분은 기록하지 않습니다. 기존 환불 이력의 변경 전·후 성공 금액 차이만 처리하므로, 재전송이나 이후 적립에서 재차감하지 않습니다. 성공 처리된 환불이 나중에 실패하면 실제로 초과 차감한 크레딧을 복원하고 예정분을 정정합니다. 회원은 `/credits`에서 **환불 차감**과 **환불 복원** 내역을 조회합니다. 기존 차감 예정량도 잔액 조회 시 새 정책으로 정산하며 `pendingRefundCredits`는 0으로 정리합니다. `GET /api/credits/transactions/`의 `refund`와 `restore`는 실제 차감·복원 내역입니다.

로컬에서는 개발 서버 시작 전에 사용자가 `backend/`에서 `.\.venv\Scripts\python.exe manage.py migrate`를 수동 실행합니다. `accounts.0012_credit_refunds`는 `credit_purchase_refunds`에 환불 ID·원주문·금액·통화·상태를 기록하고, `credit_purchases`에 결제 ID와 차감 예정 수량, `credit_transactions`에 환불 원주문 연결과 차감·복원 유형을 추가합니다. 이 마이그레이션 적용 시각부터 생성된 Stripe 환불이 대상입니다. 기존 주문은 Checkout 세션 또는 청구서로 대조합니다.

샌드박스와 운영 각각에서 위 웹훅 수신 이벤트에 `refund.created`, `refund.updated`, `refund.failed`를 추가합니다. 샌드박스에서 1,000크레딧을 충전한 뒤 30%와 나머지 금액을 차례로 환불하고, 각 성공 알림 후 `/credits`를 새로고침해 **−300**, **−700**을 확인합니다. 웹훅 전달에 실패하면 원인을 해결하고 Workbench에서 재전송합니다. [Stripe 웹훅 재전송](https://docs.stripe.com/webhooks#manual-retries)

### 회원 한 명의 기존 Plus 환불 반영

Stripe에서 이미 성공한 요금제 환불이 TOPIQ에 반영되지 않았을 때 운영자가 수동으로 실행합니다.
명령이 포함된 백엔드 배포 후, 운영 백엔드 컨테이너의 `/app/backend`에서 실행합니다.
로컬 샌드박스에서 확인할 때는 `backend/`에서 프로젝트 가상환경의 Python을 사용합니다.
예시의 `123`은 TOPIQ 내부 회원 번호입니다.

```bash
python manage.py sync_plan_refund --user-id 123
python manage.py sync_plan_refund --user-id 123 --apply
```

첫 명령은 Stripe와 DB를 조회합니다. 환불 ID, TOPIQ 주문 ID, 금액, 회원의 현재 등급, 종료할 이용 기간 수,
원구독의 갱신 취소 여부와 예상 차감량을 확인하세요. 후보가 여러 건이면 목록에서 환불 ID를 골라 미리보기와 적용에 같은 ID를 지정합니다.

```bash
python manage.py sync_plan_refund --user-id 123 --refund-id re_example
python manage.py sync_plan_refund --user-id 123 --refund-id re_example --apply
```

명령은 백엔드에 설정된 Stripe 계정을 사용합니다. 조회에는 해당 결제·청구서·환불·구독의 읽기 권한이,
갱신 중인 구독의 적용에는 구독 취소 권한이 필요하며, 결제 주기 변경이 예약된 구독은 Stripe 구독 일정도 종료합니다. 최초 결제, 주기 변경 후 결제를 포함한 갱신 청구서, 구형 일회성 Plus 이용권을 지원합니다.
웹훅 도입 전 환불도 실제 성공한 환불과 원주문이 일치하면 선택할 수 있습니다.

`--apply`는 기존 환불 ID와 금액을 기록하고 해당 이용권과 원구독의 남은 기간을 종료합니다.
이미 성공 기록이 있으면 당시 면제된 부족분을 보존하고 누락된 권한 종료만 처리합니다.
별도로 재가입한 구독은 유지합니다. 같은 구독의 후속 유료 회차가 있거나 추가 적립·예약 해제·복원으로
과거 차감액을 확인해야 하면 적용 전에 사유를 표시합니다. 해당 청구서의 결제 시각 및 크레딧 원장을 대조하세요.
성공 출력에서 실제 차감량과 최종 Free/Plus 등급을 확인합니다. Stripe 응답 오류가 발생하면 같은 환불 ID로
먼저 조회한 뒤 다시 적용할 수 있습니다.

실행 시 기존 `credit_purchase_refunds`, `credit_purchases`와 필요한 경우 `credit_accounts`,
`credit_transactions`의 데이터가 변경됩니다. 새 결제 환불이나 DB 구조 변경은 없으며 자동으로 실행되지 않습니다.

### 운영 적용

사업자 국가·상품에 대한 Stripe 실결제 지원 여부를 확인한 뒤 적용합니다. Stripe Workbench에서 **자체 계정의 스냅샷 웹훅**을 공개 Django HTTPS 주소의 `/api/payments/stripe/webhook/`로 등록하고 위 로컬 CLI 명령의 결제·구독·환불 이벤트 9개를 선택합니다. 백엔드에 운영용 `STRIPE_SECRET_KEY`, 운영 상품의 `STRIPE_PRICE_ID`, 해당 엔드포인트의 `STRIPE_WEBHOOK_SECRET`, 운영 TOPIQ 주소인 `TOPIQ_PUBLIC_URL`을 설정한 후 백엔드와 TOPIQ를 재배포합니다. 운영에서는 기존 `deploy/start.sh`가 migration 적용 후 Gunicorn을 실행합니다. 이후 금액만 변경할 때는 같은 상품에 새 KRW 가격을 만들고 백엔드의 `STRIPE_PRICE_ID`를 교체한 후 백엔드를 재시작합니다. [Stripe 웹훅 등록](https://docs.stripe.com/webhooks)

Stripe에서 결제는 성공했지만 적립 대기가 계속되면 Workbench에서 해당 세션의 `checkout.session.completed` 전달 결과를 확인합니다. 전송 실패 원인을 해결한 후 해당 이벤트를 재전송하면 Django가 같은 주문의 적립 여부를 확인하고 처리합니다.

## TOPIQ AI 쓰기 튜터 (PBT)

누구나 `/writing`에서 세트 목록을 볼 수 있습니다. 비로그인 사용자가 세트를 누르면 페이지 이동 없이 잠금·로그인 안내 팝업을 표시하고,
로그인 후 선택한 `/writing/sets/[id]`로 돌아옵니다. 문제 본문은 로그인과 세트 열람권이 필요합니다.
로그인한 사용자가 아직 열지 않은 세트를 누르면 목록에서 100크레딧 차감 안내 팝업을 표시합니다.
팝업의 세트 열기 버튼으로 구매가 완료되면 문제 페이지로 이동하며, 이미 연 세트는 바로 이동합니다.
51·52번은 두 빈칸, 53·54번은 본문 답안을 입력합니다. UI와 평가 설명은 한국어·영어·인도네시아어를 지원합니다.
평가 설명(총평·채점 근거·수정 이유·검토 사항)은 요청 당시 웹 언어로 생성하고, 문제·답안 인용·수정 문장은 한국어를 유지합니다.
생성 언어는 평가에 저장되므로 이후 웹 언어를 바꿔도 과거 평가 본문은 번역하거나 다시 생성하지 않습니다. 기존 기록은 한국어로 취급합니다.
`/writing/history`에서 본인의 평가와 크레딧 거래를 조회하고 `/writing/history/[id]`에서 제출 당시 문제·원본 답안·평가를 확인합니다.
입력 중인 답안은 현재 페이지에서만 유지되며 **제출이 접수된 답안부터 DB에 저장**됩니다.
AI 평가는 학습용 참고 결과이며 공식 TOPIK 성적이 아닙니다.

Hub 소유의 `topik_bank.writing_sets`, `topik_bank.writing_questions`는 읽기 전용으로 재사용합니다.
PBT 51~54번이 모두 있는 세트만 표시하며, 막대·선 그래프와 표 자료를 지원합니다.
평가 입력은 서버가 조회한 문제 표시 필드만 사용하고 참고답안·생성 메타데이터는 전송하지 않습니다.
문항 형식은 `backend/writing/`에 편입한 v2 평가 계약의 표준 발문·빈칸·자료·요구 사항 규칙으로 검증합니다.
세트 최초 열람 전에 네 문항의 표시·평가 형식을 모두 검증합니다. 호환되지 않는 세트는 차감하지 않습니다.

### 평가와 크레딧

신규 회원은 가입 완료 트랜잭션에서 **100크레딧을 최초 1회** 받습니다. 기존 회원의 로그인·잔액 조회에는 지급하지 않습니다.
세트 가격은 **100크레딧(51번 20 + 52번 20 + 53번 30 + 54번 30)**이며 개별 문항 구매는 없습니다.
사용자가 세트 열기 버튼을 누르면 서버가 사용 가능 잔액을 검사하고, 잔액 차감과 `unlock` 거래를 함께 저장합니다.
사용자·세트별 `unlock` 거래가 열람권입니다. 중복 요청은 기존 권한을 반환하고 추가 차감하지 않습니다.
GET 조회·링크 미리 불러오기에서는 구매하지 않으며, 로그인하지 않았거나 열람권이 없는 사용자에게 문제 본문을 제공하지 않습니다.
한 번 연 세트는 잔액이 0이어도 재열람할 수 있습니다.

TOPIQ의 ‘내 크레딧’ 화면은 잔액을 한 번 조회한 뒤 거래 내역을 불러옵니다. 쓰기 화면은 사용 가능 크레딧 배지가
표시될 때와 해당 창에 다시 포커스할 때 잔액을 갱신합니다. 세트 구매 후에도 갱신된 잔액을 표시합니다.

문항마다 **성공 평가 20회**를 포함하며 평가별 추가 차감은 없습니다. 횟수는 사용자·세트·문항별로 독립적입니다.
평가 기록의 `succeeded`와 유효한 `processing`을 합산해 접수 가능 여부를 판단하고, 기존 DB 잠금 안에서 접수하여 동시 요청도 20회를 넘지 않습니다.
실패·만료된 요청은 횟수를 소비하지 않으며, 처리 중 요청은 한 자리를 임시 점유합니다. 한도를 소진해도 문제와 기존 결과는 계속 볼 수 있습니다.
새 평가의 기존 `credit_cost` 필드는 0으로 저장합니다. 이전 평가·거래·잔액은 migration에서 변경하거나 삭제하지 않습니다.

별도 워커·대기열 없이 HTTP 요청 안에서 BizRouter Chat Completions를 호출합니다.
먼저 평가 ID·원본 답안·문제 스냅샷을 저장합니다. 모델 호출 동안 DB 잠금은 유지하지 않습니다.
응답 구조·점수 범위·원문 인용·과제 누락을 검증한 뒤 결과를 저장합니다.
53·54번 언어 점수는 이미 2배 적용된 짝수이며 서버에서 재차 곱하지 않습니다.
전체 미응답은 모델 호출 없이 0점의 성공 평가로 저장하며 1회를 사용합니다. 화면에서는 빈 답안 제출을 막습니다.
모델 또는 서버 키가 미설정이면 평가 접수를 비활성화합니다.

사용 가능 잔액은 `balance - reserved`입니다. 잔액 부족은 세트 열기 전에, 평가 횟수·동시 실행 한도 초과는 평가 접수 전에 거절합니다.
평가 조건 버전이 바뀌면 새 조건을 불러온 뒤 다시 요청합니다.
모델 오류·검증 실패는 실패 이력으로 남습니다. 서버나 DB 중단으로 처리 기한(호출 제한 시간 + 60초)을 넘긴 평가는 횟수 집계에서 제외합니다.
잔액·거래 내역·평가 이력을 조회할 때는 로그인한 회원에게 만료된 평가가 있는지 먼저 확인합니다.
정리할 건이 있을 때만 공용 DB 잠금을 잡고 해당 회원의 만료 상태를 다시 확인해 실패 처리합니다.
평가 접수·완료와 세트 열기에서는 전체 사용자의 만료 평가를 정리합니다.
이전 과금 방식의 미완료 예약은 기존 방식으로 해제합니다. 이미 실패한 평가에 늦게 도착한 결과는 반영하지 않으며 자동 재실행하지 않습니다.

`POST`의 UUID `id`는 실행 식별자이자 중복 요청 방지 키입니다. 같은 사용자·ID·답안·생성 언어는 기존 기록을 반환하고 다시 호출/차감하지 않습니다.
같은 ID로 다른 문항·답안·생성 언어를 보내면 409입니다. 기존 제출 해시는 유지하고 저장된 언어를 별도로 비교하므로 기존 한국어 요청도 재조회할 수 있습니다.
패키지 `request_id` 내용 해시에는 언어가 포함되며 실행 UUID와는 별개입니다.
브라우저는 사용자·문항별 진행 ID만 sessionStorage에 저장하고 원본 답안은 브라우저 저장소에 기록하지 않습니다.
통신 실패 시 기존 ID로 상태를 확인합니다. 새로고침 후 입력 내용이 사라졌다면 먼저 이력의 접수 여부를 확인하세요.
의도적인 재평가는 새 UUID를 사용하며 이전 기록을 보존합니다. 외부 호출은 자동 재시도하지 않습니다.

### API

세트 목록 GET은 비로그인 사용자도 이용할 수 있습니다. 목록에는 세트 식별자·번호·문항 수·가격만 제공하고,
비로그인의 `submittedSlots`는 빈 배열, `unlocked`는 false로 반환합니다. 문제 본문과 개인 이력은 노출하지 않습니다.
나머지 경로는 세션 로그인이 필요하며 POST에는 CSRF 토큰이 필요합니다. 응답은 `private, no-store`입니다.

| 메서드 | API | 목적 |
| --- | --- | --- |
| GET | `/api/writing/sets/` | 공개 세트 목록. 로그인 시에만 본인 제출·열람 상태 포함 |
| POST | `/api/writing/sets/<uuid:set_id>/unlock/` | 신규 API: 세트 최초 열람 100크레딧 차감·열람권 저장 |
| GET | `/api/writing/sets/<uuid:set_id>/` | 열람권 확인 후 문제와 문항별 `evaluationUsage` 반환 |
| GET | `/api/writing/evaluation-config/` | `questionPrices`·`setCost`·`evaluationLimit`·평가 가능 여부·조건 버전·호출 제한 시간 |
| POST | `/api/writing/evaluations/` | 열람권·20회 한도 확인, 답안 저장·동기 평가·결과 저장 |
| GET | `/api/writing/evaluations/?page=1` | 본인 평가 이력, 페이지당 20건 |
| GET | `/api/writing/evaluations/<uuid:id>/` | 본인 평가 상태·답안·결과·문제 스냅샷 |
| GET | `/api/credits/` | 잔액·예약액·사용 가능액 |
| GET | `/api/credits/transactions/?page=1` | 본인 지급·세트 열람 및 이전 거래 내역, `setId` 포함, 페이지당 20건 |

세트 열기 POST 본문은 `{}`입니다. 가격·구매자는 서버에서 결정합니다. 최초 성공은 201, 재요청은 200이며
`setId`, `unlocked`, `chargedCredits`, `credits`를 반환합니다. 재요청의 `chargedCredits`는 0입니다.
문항별 사용량은 `used`, `pending`, `remaining`, `limit`이며 문제 상세의 `evaluationUsage`와 평가 상세의 `usage`로 반환합니다.
평가 POST 필드는 `id`, `setId`, `typeSlot`, `answer`, `priceVersion`, `feedbackLanguage`입니다.
`feedbackLanguage`는 `ko`·`en`·`id` 중 하나이며 누락 시 `ko`입니다. 다른 값은 `invalid_submission`(400)으로 거절합니다.
프론트는 최초 요청의 언어를 재시도에도 사용합니다. 생성·목록·상세 응답의 `feedbackLanguage`는 저장된 생성 언어입니다.
`answer`는 51·52번 `{ "a": "...", "b": "..." }`, 53·54번 `{ "text": "..." }`이며 원본 공백을 보존합니다.
API는 빈칸 각각 200, 본문 1,000 Unicode 코드 포인트까지 받습니다. 표시 글자 수는 줄바꿈을 제외하며 원고지 칸 수와 다릅니다.
신규 완료/실패 기록은 HTTP 201, 기존 기록은 200, 기존 처리 중 기록은 202로 반환합니다. **실제 성공 여부는 `status`를 확인**합니다.
`evaluation_busy`/`rate_limited`는 429, `insufficient_credits`/`price_changed`/`request_conflict`/`evaluation_limit_reached`는 409,
`set_locked`는 403, 비로그인은 401입니다.
사용자는 모델·문제 내용·차감량을 지정할 수 없으며 타인의 평가 조회는 404입니다.

### DB 변경

쓰기 기능의 기존 테이블 3개를 재사용합니다. **이번 세트 과금 변경의 신규 테이블은 없습니다.**
기존 사용자·문제은행·읽기·듣기 테이블의 컬럼 추가/변경도 없습니다.

| 테이블 | 신규 컬럼 | 목적 |
| --- | --- | --- |
| `writing_evaluations` | `id`, `user_id`, `set_id`, `type_slot`, `submission_hash`, `question_snapshot`, `answer` | 실행 식별·소유권·제출 당시 문제와 원문 |
| 위 테이블 | `request_hash`, `package_version`, `prompt_version`, `requested_model`, `resolved_model`, `model_options`, `price_version`, `credit_cost` | 평가 계약·모델·접수 시 가격 기록 |
| 위 테이블 | `status`, `result`, `total_score`, `usage`, `error_code`, `created_at`, `expires_at`, `completed_at` | 처리 상태·검증 결과·토큰 사용량·복구 기한 |
| `credit_accounts` | `user_id`, `balance`, `reserved`, `updated_at` | 사용자별 잔액·예약액 |
| `credit_transactions` | `id`, `account_id`, `evaluation_id`, `kind`, `amount`, `balance_after`, `reserved_after`, `actor_id`, `reason`, `created_at` | 기존 지급·예약·차감·해제 내역 |
| `credit_transactions` | **추가: `set_id` (nullable UUID)** | 세트 열람 거래의 대상 식별. 기존 거래는 NULL 유지 |
| `credit_transactions` | **변경: `kind` 선택지·거래 출처 제약** | `welcome`(가입 지급), `unlock`(세트 열람) 유형 추가 |

Django migration `migration/writing/0001_initial.py`, `migration/accounts/0003_creditaccount_credittransaction.py`로 관리합니다.
평가 다국어 지원은 `migration/writing/0002_evaluation_feedback_language.py`로 기존 `writing_evaluations`에
`feedback_language`(최대 2자, 기본값 `ko`) 컬럼 1개를 추가합니다. 기존 행도 `ko`가 되며 결과·제출 해시는 보존합니다.
세트 과금 변경은 `migration/accounts/0004_writing_set_credits.py`로 관리합니다.
사용자별 `welcome` 1건, 사용자·세트별 `unlock` 1건을 조건부 유일 제약으로 보장합니다. 두 유형은 100크레딧이며 관리자·평가 연결 없이 기록합니다.
이 변경의 신규 API는 위 세트 열기 POST 1개이고, 추가 의존성·환경변수·워커는 없습니다.
잔액/예약액 제약과 평가별 거래 중복 방지 제약을 사용합니다. 짧은 PostgreSQL advisory transaction lock으로 프로세스 간 접수를 직렬화합니다.
신규 가입 경로에서만 가입 지급을 호출합니다. 기존 사용자의 최초 크레딧 계정 생성 기본 잔액은 0이며 자동 지급하지 않습니다.
거래·평가 이력이 있는 사용자 삭제는 보호됩니다. 데이터 삭제·크레딧 만료 정책은 이 기능에 포함하지 않습니다. 유료 충전 절차는 위의 ‘TOPIQ 크레딧 충전’ 항목을 참고하세요.

### 환경변수와 운영

백엔드의 `.env.development`/`.env.production` 또는 배포 환경변수에 설정합니다. 키는 프론트에 넣지 않습니다.

| 변수 | 기본값 / 설명 |
| --- | --- |
| `BIZROUTER_API_KEY` | 미설정 시 평가 비활성화. 서버용 키 |
| `WRITING_EVALUATION_MODEL` | 미설정 시 평가 비활성화. BizRouter에서 허용된 모델 ID |
| `WRITING_EVALUATION_CREDITS_51` ~ `_54` | 더 이상 사용하지 않음. 기존 환경 설정에 남아 있어도 평가 과금에 영향 없음 |
| `WRITING_EVALUATION_TIMEOUT_SECONDS` | 기본 45, 범위 5~120초. 외부 호출 제한 |
| `WRITING_EVALUATION_MAX_CONCURRENT` | 기본 1, 범위 1~32. DB를 공유하는 서버 전체의 동시 평가 제한 |
| `GUNICORN_WORKERS` | 기본 1. 양의 정수 |
| `GUNICORN_THREADS` | 기본 4. 양의 정수 |

요청은 `https://api.bizrouter.ai/v1/chat/completions`에 `max_tokens=4096`, `stream=false`로 전송합니다.
모델·호출 옵션·가격은 평가별로 기록하며 이후 설정 변경으로 과거 차감량을 바꾸지 않습니다.
Gunicorn 변수는 프로세스 환경변수로 설정하세요. Gunicorn 설정은 Django 환경 파일을 직접 로드하지 않습니다.
변경 후 백엔드를 재시작/재배포합니다. 동시 평가 한도는 일반 API 요청을 처리할 스레드가 남도록 설정합니다.
Next.js rewrite 제한은 180초, 평가 브라우저 요청 제한은 모델 호출 제한 + 20초입니다.
Gunicorn의 gthread `timeout=30`은 개별 요청 30초 제한이 아닙니다. 배포 플랫폼의 ingress 요청 제한은 따로 확인해야 합니다.
선택 모델의 실제 응답 시간·비용·채점 품질은 합성 fixture 검사와 별도로 배포 전 검증합니다.

**로컬 적용은 사용자가 `backend/`에서 다음 명령을 수동 실행합니다.**

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
```

첫 명령은 Pydantic 2.11.7 등 의존성을 설치하며 DB를 변경하지 않습니다. 두 번째 명령은 미적용 migration을 적용해 위 세 테이블과 제약을 생성합니다.
세 번째는 개발 서버 실행이며 migration을 자동 실행하지 않습니다. 기존 개발 서버는 먼저 종료 후 재시작합니다.
운영은 기존 `deploy/start.sh`가 **migrate → collectstatic → Gunicorn**을 자동 실행합니다. 별도 워커/스케줄/관리 명령은 없습니다.
**frontend-TOPIQ/**에서 `npm run dev`로 개발 서버를 수동 재시작하거나 `npm run build` 후 운영 재배포합니다. 프론트 명령은 DB를 변경하지 않습니다.

이미 설치한 로컬 환경에 평가 다국어 지원을 반영할 때는 **사용자가 `backend/`에서 백엔드 재시작 전에** 아래 명령을 수동 실행합니다.
목적은 생성 언어 컬럼 추가와 기존 행의 한국어 기본값 적용이며 DB 스키마가 변경됩니다. 에이전트와 개발 서버는 자동 적용하지 않습니다.

```powershell
.\.venv\Scripts\python.exe manage.py migrate writing 0002_evaluation_feedback_language
```

적용 후 백엔드를 재시작하고 프론트엔드도 위 방식으로 재시작/재배포합니다. 운영은 기존 `deploy/start.sh`의 자동 migration으로 적용합니다.

세트 과금을 적용하려면 **사용자가 `backend/`에서 백엔드 재시작 전에** 아래 명령을 수동 실행합니다.
`0004_writing_set_credits`를 포함한 미적용 migration을 적용하여 DB 컬럼·제약을 변경합니다. 기존 잔액·지급 내역은 유지합니다.

```powershell
.\.venv\Scripts\python.exe manage.py migrate
```

에이전트와 로컬 개발 서버는 migrate를 실행하지 않습니다. 운영은 기존 `deploy/start.sh`의 자동 migration 후 Gunicorn 시작 절차를 유지합니다.
백엔드와 `frontend-TOPIQ/`를 함께 재시작/재배포합니다. 별도 관리 명령·워커·수동 지급 작업은 신규 가입 지급에 필요하지 않습니다.

기존 회원 또는 추가 크레딧 지급은 관리자가 `/admin/accounts/creditaccount/`의 **크레딧 지급** 링크에서 수행합니다.
사용자 ID·수량·사유를 입력하면 잔액과 지급 원장이 함께 저장됩니다. 권한은 `accounts.add_credittransaction`이며 같은 지급 요청 재전송은 중복 지급하지 않습니다.
계정·거래 원장은 일반 관리자 편집/삭제로 수정할 수 없습니다. 활성 사용자의 ID는 Django 사용자 관리자에서 확인합니다.

### 검증

서비스와 분리된 일회용 PostgreSQL 연결 환경에서 `backend/`의 아래 명령을 수동 실행합니다.
Django가 테스트 DB를 생성·마이그레이션·삭제하며 서비스 DB에 migrate를 실행하지 않습니다.

```powershell
.\.venv\Scripts\python.exe manage.py test writing accounts question_bank.tests.test_writing config.tests --noinput
```

채점 계약·빈칸 치환·응답 검증, 로그인/CSRF/열람권, 신규 가입 1회 지급·실패 롤백·기존 회원 미지급,
중복/동시 세트 구매·사용 가능 잔액 검사·차감 롤백, 문항별 20회·처리 중 점유·실패/만료 복구·전역 동시 한도,
중복 평가·늦은 응답 거부·관리자 지급 중복 방지와 migration의 기존 데이터 보존을 확인합니다.
세 언어의 프롬프트·미응답 처리·저장/조회·언어 변경 충돌·중복 차감 방지와 기존 행의 migration 호환성도 검사합니다.
`frontend-TOPIQ/`에서 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`로 UI/API와 빌드를 검사합니다.
평가 예제는 `backend/writing/tests/fixtures/`의 51·52·53·54·empty-51·empty-53 폴더에 보관합니다.
각 폴더의 `input.json`, `request.json`, `response.json`을 위 테스트가 읽어 요청 구성·원문 보존·응답 검증을 확인합니다.
답안과 응답 점수는 연동 검증용 합성 데이터이며 실제 모델의 채점 정확도를 나타내지 않습니다.
운영 코드·프롬프트·채점 기준은 `backend/writing/`에서 관리하며 별도 원본 전달본 폴더나 검증 스크립트는 필요하지 않습니다.

## TOPIQ 급수별 단어장

`/vocabulary`에서 3~6급 세트를 선택하고 `/vocabulary/sets/[id]`에서 단어·품사·뜻·예문을 봅니다.
비회원도 동일하게 이용하며 이어서 학습, 완료 표시, 단어별 암기 상태, 오늘의 복습은 제공하지 않습니다.
세트를 다시 열면 첫 단어에서 시작합니다. 사이트 UI 언어(한국어·영어·인도네시아어)와 뜻 언어는 별개이며,
뜻은 영어가 기본입니다. 뜻 언어에서 영어·베트남어·일본어·중국어 간체(`中文（简体）`)·인도네시아어(`Bahasa Indonesia`)를 선택합니다.
선택한 언어의 뜻이 비어 있으면 현재 UI 언어로 미등록 안내를 표시합니다. 예문은 한국어와 영어 번역을 제공합니다.

원본 `topik_bank.vocabulary`는 읽기 전용 unmanaged 모델로 연결합니다. 조회·세트 등록은 원본 데이터를 변경하지 않습니다.
Hub와의 구조 정합화는 아래 Django migration으로 관리하며, 단어·음성 데이터 전송은 Hub에서 수행합니다.
세트 구성용 테이블은 `vocabulary_sets`(급수·세트 번호), `vocabulary_set_items`(원본 단어 ID·세트 내 순서) 두 개입니다.
원본 ID는 Hub의 데이터 관리를 막는 외래키 없이 참조하며, 등록 시와 세트 조회 시 원본 존재·급수 일치를 검사합니다.
원본 단어 삭제·급수 변경으로 연결이 맞지 않으면 자동 재배치하지 않고 명령을 중단하거나 API가 503을 반환합니다.

### 적용 순서와 초기 세트 등록

로컬에서는 사용자가 `backend/`에서 아래 순서로 **수동 실행**합니다. 새 백엔드를 시작하기 전에 구조를 적용하세요.

```powershell
# 1. 서비스 테이블 생성 및 기존 vocabulary에 Hub 014 음성·015 언어 컬럼 적용
.\.venv\Scripts\python.exe manage.py migrate

# 2. Hub에서 '서버에 단어장 등록' → '등록 내용 확인' → '선택 서버에 단어장 등록'

# 3. 등록 예상 수량 점검 후, 세트·연결 데이터 등록
.\.venv\Scripts\python.exe manage.py create_vocabulary_sets --check
.\.venv\Scripts\python.exe manage.py create_vocabulary_sets
```

서비스 테이블은 `migration/vocabulary/0001_initial.py`로 생성합니다.
`migration/question_bank/0005_vocabulary.py`는 기존 원본의 Django 모델 상태만 등록하며 DB 테이블을 만들지 않습니다.
`create_vocabulary_sets --check`는 읽기 전용 트랜잭션으로 예정 수량과 기존 연결을 점검하고 **데이터를 쓰지 않습니다**.
옵션 없는 명령은 두 서비스 테이블에만 데이터를 추가하며, 단어와 사용자 데이터는 변경하지 않습니다.
급수별 미배정 단어를 `vocabulary_id` 순으로 정렬한 뒤 최대 20개씩 균등 분배합니다.
처음 확인한 8,258개 기준 3급 80·4급 104·5급 107·6급 124세트이며 각 세트는 19~20개입니다.
재실행 시 기존 세트·순서는 유지하고 새 단어만 뒷번호 세트로 추가합니다. 소량 추가 시 새 세트는 20개보다 작을 수 있습니다.
동시 등록은 테이블 잠금으로 직렬화하고, 오류 시 해당 실행의 쓰기를 롤백합니다.

운영은 기존 `deploy/start.sh`가 migration을 **자동 실행**한 후 Gunicorn을 시작합니다.
배포 및 Hub 원본 준비 후 운영 컨테이너 `/app/backend`에서 다음을 **수동 실행**해야 실제 세트가 표시됩니다.

```sh
python manage.py create_vocabulary_sets --check
python manage.py create_vocabulary_sets
```

세트 구성 명령은 서버 시작 시 자동 실행하지 않으며 별도 워커·스케줄러는 없습니다.
TOPIQ 프론트엔드는 새 `/api/vocabulary/` rewrite를 포함해 다시 빌드·배포해야 합니다.

### Hub 음성 데이터 전송용 구조

`migration/question_bank/0006_vocabulary_audio.py`는 기존 `topik_bank.vocabulary`에 Hub 014와 동일한
타입·NULL 허용·기본값으로 아래 8개 컬럼과 `vocabulary_audio_complete` 제약을 추가합니다.

| 컬럼 | PostgreSQL 타입 |
| --- | --- |
| `audio_storage_bucket` | `text` |
| `audio_storage_path` | `text` |
| `audio_file_sha256` | `text` |
| `audio_byte_size` | `integer` |
| `audio_duration_ms` | `integer` |
| `audio_source_hash` | `text` |
| `audio_generation_config` | `jsonb` |
| `audio_created_at` | `timestamp with time zone` |

음성 필드는 기본값 없이 NULL을 허용합니다. 8개 모두 NULL이거나 모두 채워져 있어야 하며,
저장 위치의 공백, SHA-256 형식, 양수 크기·길이, JSON 객체 형식을 검증합니다.
기존 단어·ID·자동 증가 상태·세트 연결은 보존합니다. 이미 Hub에서 음성 구조를 적용했다면
컬럼과 제약이 일치하는지 확인하고 기존 음성 데이터도 유지합니다. 부분 적용이나 다른 타입·기본값·제약은
오류로 중단하고 해당 migration의 변경을 롤백하므로 원인을 확인한 뒤 다시 실행하세요.
원본 테이블이 없는 DB에서는 생성하지 않고 건너뜁니다. 이후 음성 기능이 준비된 Hub 원본을 전송하면
Hub 원본의 전체 컬럼과 제약이 함께 생성됩니다. Hub 원본에도 음성 구조가 준비되어 있어야 합니다.
Hub 015 언어 컬럼이 먼저 생성되어 있어도 음성 컬럼 추가 또는 기존 구조 검증을 수행하며,
두 기능의 컬럼 추가 순서가 달라도 허용합니다.

기존 설치도 새 백엔드를 시작하기 전에 `backend/`에서 사용자가
`.\.venv\Scripts\python.exe manage.py migrate`를 **수동 실행**한 뒤 Hub에서 대상을 선택해 전송합니다.
이 명령은 DB 구조 및 다른 미적용 migration을 적용하며 단어 데이터를 전송하지 않습니다.
에이전트나 개발 서버가 로컬에 자동 적용하지 않습니다. 운영은 기존 `deploy/start.sh`가
migration → 정적 파일 수집 → Gunicorn 시작을 **자동 실행**하고, 완료 후 Hub 전송은 **수동 실행**합니다.
Hub 전송은 단어·음성 메타데이터를 추가·갱신하며 S3 음성 파일은 공유합니다.
새 단어를 전송했다면 위 `create_vocabulary_sets --check`와 `create_vocabulary_sets`를 수동 실행합니다.
음성 정보만 갱신한 경우 기존 세트를 다시 만들 필요는 없습니다.

음성 구조 migration은 새 API·테이블·관리 명령·워커를 추가하지 않습니다.
음성 데이터 유실을 막기 위해 migration 역적용은 지원하지 않습니다.
이전 구조 복원이 필요하면 적용 전 DB 백업을 사용해야 합니다.

### 단어 발음 재생

단어 제목 옆 스피커 버튼으로 한국어 발음을 듣습니다. 뜻 언어·뜻 펼침 상태와 관계없이 재생하며,
재생 중 다시 누르면 처음부터 듣습니다. 불러오는 동안에는 중복 클릭을 막고, 실패하면 안내와 함께 재시도할 수 있습니다.
음성이 없는 단어는 회색 버튼과 `음성 준비 중` 안내를 표시합니다. 단어 이동·페이지 이탈 시 이전 재생과 파일 요청을 정리합니다.
파일은 클릭할 때만 요청하며 자동 재생하지 않습니다. 안내와 접근성 이름은 한국어·영어·인도네시아어 UI를 지원합니다.

기존 `GET /api/vocabulary/sets/{id}/` 응답의 각 단어에 `audioUrl`을 추가합니다.
백엔드의 `CLOUDFRONT_BASE_URL`과 기존 `audio_storage_path`로 URL을 만들며,
버킷 정보가 있고 경로가 `media/vocabulary-audio/<audio_file_sha256>.mp3` 형식과 일치해야 합니다.
설정 또는 유효한 음성 정보가 없으면 `null`을 반환하고 단어 학습은 계속 사용할 수 있습니다.
CloudFront에 파일이 없거나 접근할 수 없는 경우에는 재생 시 오류를 안내합니다.
API 조회 시 외부 파일 확인 요청은 하지 않으며, 필요한 음성 필드는 기존 단어 조회에 함께 포함합니다.
기존 PBT/IBT의 `storage_url`과 응시 스냅샷은 그대로 사용합니다.

**설정과 실행:** 백엔드 시작 전에 환경 변수 `CLOUDFRONT_BASE_URL`에 Hub와 동일한 HTTPS origin을 설정합니다.
경로·쿼리·인증정보 없이 배포 도메인 또는 사용자 지정 도메인만 사용합니다. 빈 값은 단어장 음성 기능을 비활성화합니다.
값이 있으면 HTTPS origin 형식을 검사하며 잘못된 값은 시작 시 오류로 알립니다. 실제 설정 값은 저장소에 기록하지 않습니다.
브라우저가 해당 배포의 단어 음성 경로에 접근할 수 있어야 하며, TOPIQ에는 S3 인증키나 새 AWS 라이브러리가 필요하지 않습니다.

로컬에서는 `backend/.env.development`에 값을 설정한 후 기존 백엔드를 종료하고 **사용자가 수동 실행**합니다.
실행 위치는 `backend/`입니다. 환경 변수 변경은 프로세스 재시작 후 반영됩니다.

```powershell
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py runserver
```

운영은 백엔드 서비스의 환경 변수에 같은 설정을 추가하고 백엔드를 재배포합니다.
기존 `deploy/start.sh`의 migrate 후 Gunicorn 자동 시작 절차는 유지합니다.
프론트 배포 전 `frontend-TOPIQ/`에서 `npm run build`를 수동 실행하거나 기존 배포 빌드 절차로 반영합니다.
이 재생 기능에는 새 migration·API 경로·테이블·DB 컬럼 추가/변경·워커·관리 명령이 없습니다.
위 실행 명령은 DB 구조나 데이터를 변경하지 않습니다. 기존 음성·언어 migration과 Hub 데이터 전송은 준비되어 있어야 합니다.

추후 음성을 Hub에서 생성하고 대상 DB로 전송하면 단어장을 다시 열거나 새로고침할 때 활성화됩니다.
기존 단어에 음성만 추가한 경우 세트 재등록이나 프론트 재배포는 필요하지 않습니다.
검증은 격리된 PostgreSQL 테스트 DB에서 `backend/`의
`.\.venv\Scripts\python.exe manage.py test vocabulary question_bank config.tests.test_settings config.tests.test_routes --noinput`으로 수행합니다.
프론트 검증은 `frontend-TOPIQ/`에서 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`를 실행합니다.

### Hub 중국어·인도네시아어 컬럼

`migration/question_bank/0007_vocabulary_languages.py`는 기존 `topik_bank.vocabulary`에
Hub 015와 동일한 `chinese_simplified`(중국어 간체), `indonesian`(인도네시아어) 컬럼을 추가합니다.
두 컬럼 모두 `TEXT NOT NULL DEFAULT ''`이며 기존 행의 새 뜻은 빈 문자열로 채워집니다.
기존 단어·음성·ID·자동 증가 상태·세트 연결과 이미 등록된 번역은 보존합니다.
이미 있는 언어 컬럼은 타입·NULL 허용·기본값을 검사하고, 일치하는 경우 없는 컬럼만 추가합니다.
불일치하면 오류로 중단하고 해당 migration의 변경을 롤백합니다.
원본 테이블이 없으면 생성하지 않고 건너뛰므로 이후 Hub에서 012·014·015가 적용된 원본을 전송합니다.

**로컬 적용:** 새 백엔드를 시작하거나 Hub에서 번역을 전송하기 전에 사용자가 `backend/`에서 수동 실행합니다.

```powershell
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate question_bank 0007_vocabulary_languages
```

이 명령은 DB 구조와 Django migration 이력을 변경하며 해당 migration에 필요한 미적용 선행 migration도 실행합니다.
에이전트와 로컬 개발 서버는 자동 적용하지 않습니다. 운영은 기존 `deploy/start.sh`의 `migrate --noinput`으로 자동 적용합니다.
실제 번역 데이터는 migration이 만들지 않으며 적용 후 Hub의 단어장 전송을 수동 실행합니다.
기존 단어의 뜻만 갱신한 경우 세트 재등록은 필요하지 않습니다.
기존 `GET /api/vocabulary/sets/{id}/`의 `meanings`는 `en`, `vi`, `ja`, `zh-Hans`, `id`를 반환하며,
`zh-Hans`는 `chinese_simplified`, `id`는 `indonesian` 컬럼을 조회합니다. 미등록 뜻은 빈 문자열로 반환합니다.
뜻 선택 기능은 기존 0007 컬럼을 사용하며 새 API·테이블·추가 DB 컬럼·관리 명령·워커는 없습니다.
0007 적용 후 새 백엔드를 재시작하고, `frontend-TOPIQ/`에서 `npm run build`를 수동 실행해 프론트엔드를 배포합니다.
번역 유실을 막기 위해 역적용은 지원하지 않습니다.

검증은 격리된 PostgreSQL 테스트 DB에 합성 데이터를 만들어 `backend/`에서
`.\.venv\Scripts\python.exe manage.py test question_bank.tests.test_vocabulary_migration vocabulary --noinput`으로 실행합니다.
Hub 구조 일치·기존 데이터 보존·DB 기본값과 NOT NULL·재적용·음성/언어 적용 순서·잘못된 구조의 롤백을 검사합니다.

### 예문 단어 뜻 조회

예문을 펼칠 때 TOPIQ 브라우저가 Garu 0.13.0 WASM을 지연 로딩해 분석합니다. Web Worker는 사용하지 않습니다.
기존 뜻·예문은 준비 중에도 표시하고, 분석이 끝나면 예문 단어를 눌러 사전 뜻을 조회할 수 있습니다.
한 학습 화면에서 분석기를 재사용하고 이탈하면 모델 다운로드를 취소하고 Garu 인스턴스를 destroy합니다.
공유 WASM 런타임의 선형 메모리는 탭에 남아 재사용될 수 있으므로 destroy가 탭 메모리 전체 반환을 의미하지는 않습니다.
예문 접기·단어 이동 시 지난 분석·사전 응답을 적용하지 않습니다. 목록·퀴즈만 사용할 때에는 모델을 로딩하지 않습니다.

사전 뜻은 Django가 로컬 PostgreSQL의 `korean_dictionary_senses`에서 조회합니다. 한국어기초사전 API 호출과 API 키는 사용하지 않습니다.
팝업은 기존 다섯 뜻 언어, 기본형·품사·최대 3개 후보·후보별 최대 3개 뜻풀이·번역을 표시합니다.
사전 출처와 이용조건은 `/open-source-licenses`에서 안내합니다.
사전 조회나 모델 다운로드가 실패해도 뜻·예문·발음·단어 이동·퀴즈는 사용할 수 있습니다.
동기 모델 초기화·분석 중에는 화면 조작이 잠시 멈출 수 있습니다. 워커는 추가하지 않았습니다.

#### API와 DB 영향

새 API는 없습니다. 기존 `GET /api/vocabulary/words/{word_id}/example-meaning/`을 사용합니다.

뜻 조회 입력은 `start`, `end`(Unicode 코드 포인트, 끝 제외), `surface`,
`candidates`(JSON 배열, 예: `[["먹다",5]]`), `version`, `lang`입니다.
버전은 `4:garu-0.13.0:segments=1` + NUL + 예문을 UTF-8 SHA-256으로 계산합니다.
서버는 제공 중인 단어·급수 연결, 예문 버전, 완전한 클릭 구간·표면형, 후보 개수·길이·품사를 검증합니다.
서버가 재분석하지 않으므로 후보의 언어적 정확성을 인증하지는 않습니다.
응답은 `surface`, `entries: [{id, headword, partOfSpeech, sourceUrl, senses}]`입니다.
입력 오류 400, 없는 단어 404, 변경된 예문 409, 사전 장애 503을 반환합니다.
사전이 비어 있으면 503 `dictionary_disabled`, 사전 테이블 조회 실패는 503 `dictionary_unavailable`입니다.
검색 결과가 없으면 200과 빈 `entries`를 반환합니다. API는 SELECT만 수행하고 세션·학습 기록을 생성하지 않습니다.
표제어·품사·단어 유형으로 정확히 검색하고 동형어별로 묶습니다. 구·문법 표현·속담·관용구도 보관하지만 현재 단어 클릭 조회에서는 제외합니다.
누락된 번역은 빈 문자열로 반환하여 한국어 뜻풀이를 유지합니다. 외부 요청용 동시성·분당 제한·타임아웃·XML 파서는 제거했습니다.
응답 `id`는 각 항목의 첫 뜻풀이 행의 내부 ID입니다.
XLS에는 국립국어원 `target_code`가 없으므로 응답의 `sourceUrl`은 사전 홈페이지를 가리킵니다.

사전 뜻풀이용 기존 테이블 `korean_dictionary_senses`를 사용합니다.
`backend/migration/vocabulary/0002_korean_dictionary_senses.py`가 테이블·검색 인덱스·원본 행 고유 제약을 생성합니다.
기존 단어장·퀴즈 API와 프록시는 유지하며 별도 작업자·Redis·예약 작업은 추가하지 않습니다.

#### 한국어기초사전 데이터

등록된 사전 데이터를 DB에서 조회하며, XLS 파일이나 별도 등록 명령은 필요하지 않습니다.
XLS 등록용 관리 명령은 제공하지 않습니다. 기존 사전 모델·테이블·마이그레이션은 유지합니다.

| 테이블 컬럼 | 내용 |
| --- | --- |
| `id` | 내부 자동 증가 기본키 |
| `headword` | 검색 표제어. 앞뒤 공백 제거·Unicode NFC 정규화 |
| `homonym_number` | 동형어 번호 |
| `part_of_speech` | 한국어 품사 |
| `entry_type` | word / phrase / expression / proverb / idiom |
| `sense_order` | 같은 항목의 뜻풀이 순서. 분할 파일 경계를 넘어 이어짐 |
| `definition` | 한국어 뜻풀이 |
| `translations` | 11개 언어별 translation, translatedDefinition JSON |
| `examples` | 원본 용례 텍스트 |
| `metadata` | 발음·활용·등급·관련어·문형 등 나머지 비어 있지 않은 원본 열 |
| `source_file`, `source_row` | 원본 파일명과 Excel 행 번호. 두 컬럼 조합은 고유함 |

부표제어는 별도 뜻풀이·용례·번역 열을 사용합니다. 부모의 표제어·동형어 번호·품사는
metadata에 보존하고, 부표제어 자체의 품사는 빈 값·동형어 번호는 0으로 저장합니다.
11개 언어는 mn, ar, zh-Hans, vi, th, id, ru, en, ja, fr, es입니다.
일부 항목에는 번역이 없으며, 조회 시 한국어 뜻풀이를 유지합니다.
뜻풀이 문장이 같아도 서로 다른 원본 행은 합치지 않습니다.

출처·CC BY-SA 2.0 KR 안내와 정규화 변경 고지는 유지합니다.

#### 브라우저 자산과 라이선스

`garu-ko==0.13.0`의 공식 엔진·모델을 수정 없이 사용합니다.
`frontend-TOPIQ/scripts/prepare-assets.mjs`가 설치된 패키지에서 브라우저 ESM·WASM·모델을
`public/garu-0.13.0/`에 복사합니다. 모델·WASM의 SHA-256을 확인하며 추가 모델 다운로드나 tar는 필요하지 않습니다.
사용 중인 라이브러리의 LICENSE·NOTICE, Garu 사전 출처 기록, Next.js에 포함된 고지를
`public/open-source/`에 복사하고 실제 설치 버전으로 목록을 생성합니다.
`/open-source-licenses` 페이지와 공통 푸터 링크에서 한국어·영어·인도네시아어로 안내합니다.
Garu 엔진은 Apache-2.0이며 포함 사전 데이터의 Apache-2.0 / CC BY-SA 2.0 KR 고지는 별도로 보존합니다.
원문의 정규화·변경 내역과 출처 기록도 함께 배포합니다. 생성 자산은 Git에 포함하지 않습니다.

버전별 자산은 HTTP 캐시를 사용합니다. 첫 Garu 로딩 시 이전 Kiwi 전용 Cache Storage를 삭제합니다.
HTTPS(로컬 localhost 허용), WebAssembly, Web Crypto를 지원하는 브라우저가 필요합니다.
모델·WASM 다운로드 제한은 60초이며, 동기 초기화·분석 도중에는 선점 취소가 불가능합니다.

#### 적용 순서와 실행 위치

1. **frontend-TOPIQ 폴더에서**, 변경 코드를 받은 뒤 `npm ci`를 **수동 실행**합니다.
2. 같은 폴더에서 개발은 `npm run dev`, 배포 빌드는 기존 `DJANGO_BACKEND_URL` 설정으로
   `npm run build`를 **수동 실행**합니다. `predev`·`prebuild`가 자산·라이선스 준비를 **자동 실행**합니다.
   준비만 다시 할 때에는 같은 폴더에서 `npm run prepare:assets`를 **수동 실행**합니다.
   기존 Docker 빌드도 이 절차와 public 복사를 사용합니다. 모든 명령은 DB에 접근하지 않습니다.
3. 프론트·백엔드의 분석 버전을 맞추어 함께 배포하고 기존 학습 페이지를 새로고침합니다.
   로컬 백엔드는 **backend 폴더에서** `.\.venv\Scripts\python.exe manage.py runserver`로 **수동 재시작**합니다.
   등록된 사전 데이터를 그대로 사용하며 추가 등록이나 DB 변경은 필요하지 않습니다. 기존 운영 `deploy/start.sh` 절차는 유지합니다.

#### 검증

**frontend-TOPIQ 폴더에서** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`를 수동 실행합니다.
프론트 테스트는 설치된 Garu WASM으로 기본형·접미사·이모지·클릭 구간·문장부호 처리를 확인합니다.
**backend 폴더에서**, 서비스와 분리된 일회용 PostgreSQL 연결 설정으로
`.\.venv\Scripts\python.exe manage.py test vocabulary config.tests.test_settings --noinput`을 수동 실행합니다.
Django가 임시 테스트 DB만 생성·삭제합니다. 서비스 DB에 테스트 명령이나 migrate를 실행하지 않습니다.

Garu는 사전 검색용 기본형을 항상 정확하게 복원하지는 않습니다.
`공부했다 → 공부하다`, `아름다운 → 아름답다`, `도왔어요 → 돕다`를 복원하지만,
`도착해요 → 착하다`, `골목길을 걸어요 → 걸다`와 같은 오류가 있습니다.
실제 예문 8,258개의 기존 Python 분석 스냅샷과 비교한 후보 차이는 정답률이 아닙니다.
2026-11-12 실제 예문 8,258개를 동일한 배포 Garu WASM으로 분석했습니다.
원문 재구성 오류·잘못된 후보 형식은 0건입니다. 기존 분석 스냅샷 대비 후보(표제어·품사) 차이는
2,273문장(27.5%), 2,681/56,273어절(4.8%)이며 표제어 자체 차이는 2,027어절(3.6%)입니다.
이 수치는 정답 주석과 비교한 정확도가 아닙니다. 초기화 이후 문장 분석은 Node WASM 기준 p50 0.76ms / p95 1.32ms였습니다.

프로덕션 빌드, Edge 157.0.4341.42의 390×844 모바일 모사, CPU 4배 제한·4Mbps·지연 150ms에서
첫 예문 펼치기부터 단어 클릭 가능까지 3회씩 측정했습니다. 실제 Android/iPhone 측정은 아닙니다.

| 측정 | 캐시 없음 | HTTP 캐시 있음 |
| --- | --- | --- |
| 첫 예문 준비 중앙값 | 3.95초 (3.81~3.97초) | 0.59초 (0.59~0.66초) |
| Garu 자산 네트워크 전송 | 약 1.47MiB | 0MiB |
| 가장 긴 메인 스레드 작업 | 523ms | 328ms |
| WASM 선형 메모리 | 18.625MiB | 18.625MiB |
| 예문 준비 후 JS heap used | 약 6.16MiB | 약 4.88MiB |

WASM 영역·JS heap·브라우저 프로세스 메모리는 서로 다른 측정치이며 합산해 전체 RAM 사용량으로 해석하지 않습니다.
학습 이탈 시 Garu 인스턴스는 해제되지만 WASM 영역은 탭에 유지됩니다. 8회 생성·해제를 반복해 같은
18.625MiB 영역을 재사용함을 확인했습니다. 초기화 중 약 0.5초의 화면 멈춤이 있으며 워커는 도입하지 않았습니다.

아래는 기존 Garu 화면의 브라우저·프로덕션 빌드 검증 기록입니다.
모바일 브라우저에서 실제 Garu 분석, 20개 단어 이동·재사용, 기존 음성 재생, 사전 팝업·언어·닫기,
20문항 채점 화면·해설·결과·오답 복습, 모델 다운로드 실패 후 재시도와 퀴즈 이용을 확인했습니다.
라이선스 페이지의 세 UI 언어·모바일/PC 레이아웃을 확인했습니다. 최종 standalone 빌드에서
고지 링크 150개, 배포 모델·WASM 무결성과 캐시 헤더, Garu 예문 표시를 확인했습니다.
브라우저의 단어장·퀴즈 데이터는 실제 읽기 전용 스냅샷이며 사전·채점 응답은 테스트 응답입니다.
사전 조회는 별도 테스트 DB에서 동형어·품사·번역 누락·조회 응답과 읽기 전용 동작을 검증합니다.

### 세트별 문장 빈칸 퀴즈

세트 목록의 `문제 풀기` 또는 단어 학습 마지막 버튼에서 `/vocabulary/sets/[id]/quiz`로 이동합니다.
기존 세트에 연결된 단어 중 `sentence_blank` 문제가 있는 단어마다 한 문제를 무작위로 선택하고 출제 순서를 섞습니다.
단어당 최대 한 문제, 세트당 최대 20문제이며 목록의 문제 수는 전체 원본 문제 수가 아닌 출제 가능한 단어 수입니다.
일부 단어에만 문제가 있으면 해당 단어만 출제합니다. 문제가 없는 세트는 `문제 준비 중`으로 표시합니다.

보기 선택 후 `정답 확인`을 누르면 서버가 채점하고 정답·한국어 해설·단어·다섯 언어의 뜻을 반환합니다.
제출 전 응답에는 정답 번호·허용 정답·해설·단어 제목·뜻·생성 메타데이터를 포함하지 않습니다.
원본의 `updated_at`을 문제 버전으로 전달하며, 채점 시 버전이 다르면 409로 새 퀴즈 시작을 안내합니다.
Hub에서 문제를 수정할 때는 `updated_at`도 갱신해야 합니다. 삭제되거나 세트에 속하지 않는 문제는 404입니다.
정답 확인 후 선택을 바꿀 수 없으며 마지막에 이번 회차의 정답 수를 보여줍니다.
`틀린 문제 다시 풀기`는 같은 문제·보기로 오답만 다시 출제하고, 복습 결과에서 계속 틀린 문제만 재시도할 수 있습니다.
`새 퀴즈 시작`은 세트에서 다시 문제를 뽑습니다. 비회원도 이용하며 시간 제한·진행 저장·응시 테이블은 없습니다.
결과와 오답 목록은 화면 메모리에만 유지되어 새로고침·이탈 시 초기화됩니다.

원본 `topik_bank.vocabulary_questions`는 Hub가 관리하며 `question_bank.VocabularyQuestion`의 unmanaged 모델로 조회합니다.
`migration/question_bank/0008_vocabulary_questions.py`는 Django 모델 상태만 등록합니다.
새 DB 테이블·컬럼·인덱스를 만들거나 기존 문제·세트·사용자 데이터를 변경하지 않습니다.
문제 테이블 조회가 실패해도 단어 목록·학습은 유지하고 `문제 확인 불가`를 표시하며, 퀴즈 API는 503을 반환합니다.

로컬 적용은 사용자가 **기존 `0007_vocabulary_languages`까지 적용된 개발 DB**에서 아래 명령을 수동 실행합니다.
목적은 기존 문제 테이블의 모델 매핑 이력 등록이며 `django_migrations`에 적용 이력만 기록합니다.
백엔드 재시작 전에 실행하고, 에이전트나 `runserver`는 자동 적용하지 않습니다.

```powershell
cd backend
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate question_bank 0008_vocabulary_questions
```

운영 배포 전에는 대상 DB에 Hub의 `topik_bank.vocabulary_questions` 테이블과 문제 데이터가 준비되어 있는지 확인합니다.
이 migration은 원본 문제 테이블을 생성하거나 데이터를 전송하지 않습니다. 원본이 없으면 Hub의 단어 문제 전송을 먼저 수행합니다.
운영은 기존 `deploy/start.sh`의 자동 `migrate` 후 Gunicorn 시작 절차를 유지합니다.
기존 세트 재등록 명령은 필요하지 않으며, 프론트는 `frontend-TOPIQ/`에서 `npm run build` 후 기존 절차로 재배포합니다.
새 관리 명령·백그라운드 작업·의존성은 없습니다.

### 단어장 API와 검증

| 메서드 | 경로 | 목적 |
| --- | --- | --- |
| GET | `/api/vocabulary/levels/` | 등록된 급수별 단어·세트 수 |
| GET | `/api/vocabulary/sets/?level=3&page=1` | 급수별 세트 목록, 24세트씩 페이지 구분 |
| GET | `/api/vocabulary/sets/{id}/` | 세트의 단어·다섯 언어 뜻·한국어/영어 예문·발음 URL |
| GET | `/api/vocabulary/sets/{id}/questions/` | 단어당 하나의 문장 빈칸 문제·보기·버전 조회 |
| POST | `/api/vocabulary/sets/{id}/questions/{question_id}/check/` | 선택 답 채점, 정답·해설·단어 뜻 반환. DB 저장 없음 |

조회·채점은 회원 인증 없이 가능하며 사용자별 상태나 학습 기록을 저장하지 않습니다.
세트 목록·상세 응답의 `quizQuestionCount`는 출제 가능 단어 수이며, 문제 테이블 조회 실패 시 `null`입니다.
채점 요청은 JSON `{ "selectedOption": 1, "version": "조회 응답의 version" }` 형식이며 1~4의 정수만 허용합니다.
기존 `GET /api/csrf/`에서 받은 CSRF 토큰을 `X-CSRFToken` 헤더로 전송합니다. 모든 퀴즈 응답은 `no-store`입니다.
등록된 세트가 없으면 빈 목록을 반환합니다. 잘못된 급수·페이지는 400, 없는 세트·페이지는 404,
테이블 미적용·원본 연결 오류 등은 연결 정보를 노출하지 않는 503 응답으로 처리합니다.

백엔드는 `backend/`에서 `.\.venv\Scripts\python.exe manage.py test vocabulary question_bank config.tests.test_routes --noinput`으로 검사합니다.
Django 테스트 러너가 별도 테스트 DB를 생성·삭제하므로 운영 연결 설정으로 실행하지 않습니다.
균등 배정·누락/중복·반복 실행·추가 등록·읽기 전용 점검·페이지 구분·원본 누락·쓰기 차단을 합성 데이터로 검증합니다.
퀴즈는 단어당 한 문제 선택·정답 미노출·세트 경계·빈 세트·정답/오답 채점·CSRF·변경된 문제 거부·원본 읽기 전용을 검증합니다.
음성 migration은 Hub 구조 일치·기존 데이터/세트/자동 증가 보존·이미 적용된 구조·잘못된 구조의 롤백과 음성 제약을 검증합니다.
프론트엔드는 `frontend-TOPIQ/`에서 `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`를 실행합니다.

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

백엔드 테스트는 `accounts/`, `surveys/`, `pbt/`, `question_bank/`, `vocabulary/`, `config/` 각각의 `tests/`에 둡니다.
앱 단위 실행(`manage.py test accounts`)은 그대로 사용할 수 있고, 개별 파일은 `accounts.tests.test_core`처럼 지정합니다.

격리된 PostgreSQL 테스트 환경을 지정한 후 `backend/`에서:

```sh
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test accounts surveys config.tests.test_settings config.tests.test_health config.tests.test_cors config.tests.test_routes --noinput
```

테스트는 합성 데이터와 `test_<DB_NAME>`을 사용하며 테스트 계정에는 CREATEDB 권한이 필요합니다. 운영 DB 연결 설정으로 실행하지 않습니다.
환경 설정 파싱 테스트만 실행하려면 `.venv/bin/python -m unittest config.tests.test_settings`를 사용합니다.

## 공유 백엔드의 TOPIQ 인증

TOPIQ의 Next.js 서버가 `DJANGO_BACKEND_URL`로 공유 Django를 호출합니다. 로그인과 비밀번호 관리는 `frontend-TOPIQ/`에서 제공합니다.

| 메서드 | 경로 | 목적 |
|---|---|---|
| POST | `/api/auth/email/send/` | Brevo 이메일 인증 발송·재발송 |
| POST | `/api/auth/email/verify/` | 서명된 인증 토큰 검증 |
| POST | `/api/auth/signup/` | 이메일 인증 후 가입·로그인 |
| POST | `/api/auth/login/` | 이메일·비밀번호 로그인 |
| POST | `/api/auth/password/request/` | 비밀번호 복구 또는 설정 변경 확인 메일 요청 |
| POST | `/api/auth/password/confirm/` | 메일 링크를 검증하고 새 비밀번호 저장 |
| POST | `/api/auth/logout/` | 세션 종료 |
| GET | `/api/auth/me/` | 현재 회원 및 비밀번호 사용 여부(`hasUsablePassword`) 조회 |

비밀번호 찾기는 `purpose=reset`과 이메일을, 설정의 비밀번호 변경은 `purpose=change`와 현재 비밀번호를 전송합니다. 두 요청 모두 화면 언어(`ko`, `en`, `id`)를 전달합니다. 설정 변경은 로그인 계정에 등록된 이메일로만 발송합니다. 분실 요청은 가입 여부와 관계없이 같은 접수 메시지를 표시합니다.

메일 링크는 15분간 유효합니다. 확인 API에 `token`, `new_password`, `new_password_confirm`을 제출해 저장하면 먼저 발급된 링크도 무효가 됩니다. 분실 복구 후에는 다시 로그인해야 합니다. 설정 변경은 메일을 요청한 브라우저에서 완료하며 그 로그인 세션만 유지됩니다. 기존 Brevo 설정을 사용하며 이 기능에 필요한 추가 마이그레이션이나 수동 실행 명령은 없습니다.

CSRF·세션 쿠키·사용자 테이블과 기존 `accounts_rate_limit` 테이블을 유지합니다. 로그인·가입·메일 발송의 시도 제한은 PostgreSQL에 저장하며 서버 재시작 후에도 유지됩니다. 제한 저장소 오류는 503으로 응답합니다.
이 테이블과 `migration/accounts/0002_rate_limit.py`는 기존 원격 변경이며 이번 랜딩페이지 변경에서 새로 추가한 것이 아닙니다.
운영자가 `manage.py cleanup_auth_rate_limits --batch-size 1000`을 실행하면 만료된 제한 기록만 정리합니다. 자동 워커는 없습니다.

TOPIQ 이메일 인증에는 백엔드 런타임에 `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `TOPIQ_PUBLIC_URL`을 설정합니다. 키는 프론트엔드에 전달하지 않습니다.
`DJANGO_CSRF_TRUSTED_ORIGINS`에는 랜딩페이지와 TOPIQ의 정확한 origin을 함께 등록합니다. 테스트에서는 메일 전송을 모킹하고 실제 메일을 발송하지 않습니다.

### 계정·세션별 요청 제한

가입 인증 메일, 시험 결과 메일, PBT·IBT 결과 링크 인증은 IP 대신 요청자의 계정 또는 브라우저 세션으로 횟수를 셉니다.
로그인한 사용자는 계정 ID를, 비회원은 서버가 생성해 기존 Django 세션에 저장한 임의 식별자를 사용합니다.
`REMOTE_ADDR`와 `X-Forwarded-For`는 이 제한에 사용하지 않습니다. Cloudtype의 서버 IP가 바뀌거나 같은 프록시·NAT를 사용해도 서로 다른 계정·세션의 한도는 합쳐지지 않습니다.

| 기능 | 요청자별 한도 | 함께 적용되는 기존 한도 |
|---|---|---|
| 가입 인증 메일 | 비회원 세션별 100회/시간 | 이메일별 60초 재발송 간격, 5회/10분 |
| 비밀번호 복구·변경 메일 | 용도별 요청 계정 또는 세션당 100회/시간 | 용도별로 이메일당 60초 재발송 간격, 5회/10분 |
| 기존 비회원 시험 결과 메일 | 로그인 계정별 100회/시간 | 응시별 60초 재발송 간격, 응시·수신 이메일별 각각 5회/시간 |
| 결과 링크 인증 | 로그인 계정별 100회/10분 | 토큰 검증·만료·접근 권한 검사 |

요청자 한도를 먼저 확인하므로 이미 차단된 요청이 다른 이메일·응시의 발송 한도를 소모하지 않습니다.
같은 계정은 여러 브라우저에서 한도를 공유하며, 비회원의 여러 탭은 같은 세션을 사용하면 한도를 공유합니다.
동일 이메일·응시의 보호 한도는 세션을 바꿔도 유지합니다. 비회원이 쿠키를 삭제하면 새 세션이 생기므로 세션별 제한만으로 자동화 공격이나 대량 신규 세션 생성을 막을 수는 없습니다.

기존 `django_session`, `accounts_rate_limit` 테이블과 HMAC 저장 방식을 사용하며, 제한 시 `429`와 `Retry-After`를 반환합니다. 공개 비밀번호 복구 요청에서는 수신 주소별 제한에 도달해도 같은 `202` 접수 응답을 반환합니다.
같은 PostgreSQL과 `DJANGO_SECRET_KEY`를 유지하면 세션과 제한 기록은 서버 재시작·재배포 후에도 유지됩니다. 세션 쿠키를 정상적으로 송수신해야 합니다.
이전 `email-send-peer`, `result-peer`, `result-access-peer` 기록은 새 제한에서 조회하지 않으며 기존 만료 정리 절차로 정리합니다. 배포 시 직접 삭제할 필요는 없습니다.
요청자별 카운터는 새 범위로 시작하고 기존 이메일·응시별 카운터는 이어서 사용합니다.

`DJANGO_TRUSTED_PROXY_CIDRS` 설정은 필요 없으며 코드에서 읽지 않습니다. 이전에 등록했다면 배포 설정에서 제거할 수 있습니다.
HTTPS 판별용 `DJANGO_TRUST_PROXY`, CSRF·쿠키 설정은 기존대로 유지합니다.
TOPIQ의 `DJANGO_BACKEND_URL=https://api.unigate.kr` 공개 HTTPS 연결을 그대로 사용할 수 있고, 이 변경을 위해 내부 주소로 전환하거나 프록시 IP를 조사할 필요는 없습니다.

### 보안 업데이트 적용

Django는 5.2.19, 두 프론트엔드의 잠금 파일은 Next.js 16.4.6을 사용합니다.
개발 서버를 종료한 뒤 각 폴더에서 아래 의존성 설치를 수동 실행하고 다시 시작합니다.

| 실행 위치 | 명령 | 목적 |
|---|---|---|
| `backend/` (프로젝트 가상환경 활성화 후) | `python -m pip install -r requirements.txt` | Django 업데이트 |
| `frontend/` | `npm ci` | UNIGATE 잠금 파일 적용 |
| `frontend-TOPIQ/` | `npm ci` | TOPIQ 잠금 파일 적용 |

Django·Next.js 보안 업데이트를 처음 운영에 적용할 때는 세 서비스의 이미지를 재빌드·재배포합니다. 아래 Docker 배포 명령과 TOPIQ README의 빌드 명령을 사용합니다.
계정·세션별 제한 변경은 백엔드 이미지를 재빌드·재배포하면 적용됩니다. 새 환경변수는 없으며 기존 DB·운영 비밀 키·쿠키 설정을 유지합니다. Django·Next.js 보안 업데이트가 아직 운영에 반영되지 않았다면 두 프론트엔드도 함께 재빌드·재배포합니다.
이 변경은 새 API·테이블·컬럼·migration·워커·관리 명령을 추가하지 않습니다. 별도 DB 변경이나 제한 기록 삭제는 필요하지 않습니다.
운영 시작 시 기존 `deploy/start.sh`의 migrate → collectstatic → Gunicorn 절차는 유지하며, 로컬 migrate는 에이전트가 실행하지 않습니다.

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

Gunicorn 요청 로그는 `backend/deploy/gunicorn.conf.py`에서 설정하며 표준 출력에 기록합니다.
기존 요청 방식·경로·상태 코드·처리 시간에 다음 항목을 함께 기록합니다.

- `ip`: Gunicorn에 직접 연결한 IP. Cloudtype에서는 프록시 IP일 수 있습니다.
- `forwarded_for`: `X-Forwarded-For` 헤더의 전달 IP 목록. 헤더가 없으면 `-`이며, 프록시의 헤더 처리 정책을 확인하기 전에는 실제 사용자 IP로 단정하지 않습니다.
- `bytes`: Gunicorn이 보낸 응답 본문의 바이트 수. 프록시가 최종 전송한 크기와 다를 수 있습니다.
- `user_agent`: 요청의 User-Agent. 헤더가 없으면 `-`입니다.

쿼리 문자열·요청 본문·쿠키·인증 헤더는 기록하지 않습니다. 로컬 `runserver` 로그에는 이 설정이 적용되지 않습니다.
적용 시 Cloudtype에서 백엔드 이미지를 수동으로 재빌드·재배포합니다. 컨테이너 시작 시 기존 `deploy/start.sh`가
`/app/backend`에서 `gunicorn -c /app/backend/deploy/gunicorn.conf.py config.wsgi:application`을 자동 실행하므로 별도 실행 명령은 없습니다.
이 로그 설정 변경은 API·DB 테이블·컬럼·migration을 추가하거나 변경하지 않습니다.

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
.\.venv\Scripts\python.exe manage.py sync_exams --check
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

## PBT·IBT 모의고사

`frontend-TOPIQ`의 `/pbt`, `/ibt`에서 듣기·읽기와 연습·실전 모드를 각각 선택합니다.
두 시험은 목록·응시·저장·채점·결과 화면을 공유하고 시험 방식별 규칙을 적용합니다. 쓰기는 포함하지 않습니다.

| 시험 | 영역별 문항 수 | 점수 | 실전 듣기 | 실전 읽기 |
|---|---|---|---|---|
| PBT | 50 | 문항당 2점, 100점 만점 | 60분 | 70분 |
| IBT | 30 | 정답 수 ÷ 30 × 100, 정수 반올림 | 35분 | 40분 |

연습은 시간 제한이 없습니다. IBT 점수는 학습용 모의고사 환산 점수이며 공식 성적 환산을 제공하지 않습니다.
결과에는 정답 수와 전체 문항 수도 표시합니다. 실전 시간은 서버의 마감 시각을 기준으로 처리합니다.
듣기는 기존 공통 플레이어를 사용합니다. 연습에서는 자유롭게 재생·반복·탐색할 수 있고,
실전에서는 자동 재생 후 재생·일시정지·탐색·반복 조작이 제한되며 음원 종료 후 문항을 이동합니다.
이 재생 제한은 브라우저에서 처리하며, 시험 시간과 답안 마감은 서버에서 검사합니다.

IBT 듣기 1~2번은 그림 선택지, 읽기 4~7번은 자료 이미지를 표시합니다.
듣기 15~30번과 읽기 23~30번은 두 문항씩 공통 음원·지문을 사용합니다.
새 응시는 답안 저장 시 묶음 정보를 문항 스냅샷에 저장하며, 이전 PBT 응시의 기존 묶음 표시도 지원합니다.

방문자는 PBT·IBT의 공개 세트 목록을 볼 수 있습니다. 카드 하단의 **로그인 후 열기**에서 로그인하면 선택한 영역과 모드로 돌아옵니다. Free는 시험 방식별 읽기·듣기의 첫 공개 세트를 반복 응시할 수 있고, Plus는 모든 공개 세트를 이용합니다.
Free 세트는 공개 목록의 회차 순서(동률이면 UUID 순)로 정합니다. 기존 비회원 슬롯은 Free 권한 판정에 사용하지 않습니다.
로그인·세션 응답의 `user.plusEndsAt`은 활성 Plus의 만료 시각이며 Free이면 `null`입니다.
비로그인 응시·이력·결과 요청은 `401 login_required`, Free 계정의 Plus 전용 세트 응시 요청은 `403 plus_required`를 반환합니다. 만료 전에 제출한 본인 결과는 로그인 후 다시 볼 수 있습니다.
응시 시작과 조회·저장·제출·결과에서도 시험 방식과 소유권을 검사합니다.
PBT 경로로 IBT 시험·응시를 요청하거나 반대로 요청하면 접근할 수 없습니다.
기존 비회원 기록은 Django 세션의 무작위 소유자 UUID에 연결되어 있습니다. 응시 API와 결과 조회에는 로그인이 필요합니다.
로그인하면 같은 세션의 비회원 기록을 계속 볼 수 있지만 계정으로 자동 이관되지는 않습니다.
쿠키 삭제·만료·로그아웃 시 비회원 기록에 대한 접근이 사라집니다.

로그인한 사용자의 시험 카드에는 선택한 모드의 최근 제출 점수를 표시합니다.
점수 배지를 누르면 결과로 이동하며, 모드·제출일도 확인할 수 있습니다.
최근 100건 기록과 별도로 전체 기록에서 세트·모드별 최근 점수를 조회하므로 오래된 결과도 표시됩니다.
연습 모드의 진행 중 응시는 이어풀기를 제공하며 재응시 중에도 이전 제출 점수를 유지합니다.
실전은 시험 화면을 나가면 저장된 답안으로 종료하며 이어풀기를 제공하지 않습니다.

### 마이그레이션과 시험 등록

드래그 문장 순서 배열은 새로 시작하는 IBT 읽기 13~14번에만 적용합니다.
PBT 읽기 13~15번은 기존·신규 응시 모두 네 가지 배열 보기 중 하나를 고르는 4지선다입니다.
IBT에서는 오른쪽 `(가)~(라)` 문장을 왼쪽 네 칸에 드래그하거나, 문장 선택 후 칸을 선택합니다.
배치한 문장끼리는 위치를 교환하고, 제시문 영역으로 끌거나 개별 되돌리기 버튼으로 반환합니다.
초기화 버튼은 없습니다. 각 이동은 자동 저장되며 일부만 배치한 상태도 이어풀기에서 복원됩니다.
네 칸을 모두 채워야 답변 완료로 표시하고 전체 순서가 맞아야 점수를 부여합니다.
기존 진행 중 응시·제출 결과는 저장된 객관식 형식을 유지합니다.

`migration/pbt/0006_attemptitem_selected_order.py`는 기존 `pbt_attempt_items`에 nullable JSON 컬럼
`selected_order` 하나를 추가합니다. 새 테이블·API·관리 명령·의존성·워커는 없습니다.
원본 문제은행을 수정하지 않고 IBT 응시 생성 시 문장과 기존 정답 보기의 형식을 검증합니다.
기존 `PUT /api/ibt/attempts/{id}/answers/{position}/`에서 드래그 문항은
`{"selectedOrder":["나",null,"가",null]}`처럼 정확히 네 칸을 받습니다.
`PUT /api/pbt/attempts/{id}/answers/{position}/`와 IBT의 일반·기존 객관식 문항은
`selectedOption`을 그대로 사용합니다. 중복·알 수 없는 문장·문항과 다른 답안 형식은 400으로 거부합니다.
기존 응시 조회 API는 IBT 드래그 문항에 `answerMode`, `sentences`, `selectedOrder`를 반환하고,
결과 접근 권한이 있는 제출 결과에만 `correctOrder`를 포함합니다.

**로컬 적용:** 새 백엔드를 시작하기 전에 사용자가 `backend/`에서 다음 명령을 수동 실행합니다.
DB 컬럼을 추가하는 명령이며 에이전트나 로컬 서버가 자동 실행하지 않습니다.

```powershell
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate
```

운영에서는 기존 `deploy/start.sh`의 `migrate --noinput`이 시작 시 자동 적용합니다.
기존 등록 세트에는 `sync_exams` 재실행이 필요하지 않습니다.
검증은 격리된 PostgreSQL 테스트 DB에서 `backend/`의
`.\.venv\Scripts\python.exe manage.py test pbt question_bank --noinput`과
`frontend-TOPIQ/`의 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`로 수행합니다.

최초 적용 시 **사용자가 `backend/`에서 수동으로** 아래 순서대로 실행합니다.
로컬 서버를 실행하기 전에 마이그레이션을 적용하세요. 로컬 서버 시작 시 자동 적용하지 않습니다.

```powershell
cd backend
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py sync_exams --check
.\.venv\Scripts\python.exe manage.py sync_exams
```

- `migrate`: `migration/pbt/0002_exam_format.py`를 포함한 미적용 마이그레이션을 적용합니다.
  기존 `pbt_exams`, `pbt_attempts`에 `exam_format`을 추가해 기존 행은 `pbt`로 유지하고 비회원 슬롯 제약을 확장합니다.
  새 테이블은 없으며 기존 응시 ID·점수·문항 스냅샷을 보존합니다. 원본 문제은행은 이 마이그레이션에서 변경하지 않습니다.
- `sync_exams --check`: **PBT·IBT 모두** 검증만 수행하는 읽기 전용 명령입니다. DB 행이나 스키마를 변경하지 않습니다.
- `sync_exams`: **PBT·IBT 모두** 완성된 신규 세트를 시험 목록에 등록·공개합니다. `pbt_exams` 행을 추가하며 스키마나 원본 문제은행을 변경하지 않습니다.
  기존 제목·회차·공개 여부·비회원 슬롯은 보존합니다. 반복 실행해도 같은 세트를 중복 등록하지 않습니다.

선택한 시험만 처리하려면 다음처럼 실행합니다. `--check`와 함께 사용할 수 있습니다.

```powershell
.\.venv\Scripts\python.exe manage.py sync_exams --exam-format pbt
.\.venv\Scripts\python.exe manage.py sync_exams --exam-format ibt
.\.venv\Scripts\python.exe manage.py sync_exams --exam-format ibt --check
```

기존 `sync_pbt_exams` 명령은 `sync_exams`로 변경되었습니다. 기존 수동 실행 명령도 새 이름으로 바꾸세요.
새 Hub 세트를 전송한 뒤에는 등록 명령을 다시 수동 실행합니다. 실행 순서는 PBT와 IBT를 같은 트랜잭션 안에서 차례로 처리합니다.
시험 방식·영역별 생성 시각과 UUID 순으로 회차를 매기고 빈 비회원 슬롯 1~3을 할당합니다.
문항 수·위치·정답·선택지·현재 미디어 해시·묶음 자료를 검증하여 불완전한 세트는 사유와 함께 건너뜁니다.
새 응시 시작 시에도 검증하며 불완전한 세트는 409로 안내합니다. 저장된 문항은 스냅샷으로 조회·재개·채점하며,
새 응시의 미응답 문항은 문제은행에서 조회합니다. 이전 방식으로 생성된 응시는 전체 스냅샷을 유지합니다.
관리자에서는 시험 방식별 필터와 공개 여부·비회원 슬롯 조정을 제공합니다.

운영은 기존 `deploy/start.sh`가 **마이그레이션 → 정적 파일 수집 → Gunicorn**을 자동 실행합니다.
시험 등록은 자동 실행하지 않으므로 배포와 Hub 데이터 전송 이후 운영 환경에서 `python manage.py sync_exams --check`,
`python manage.py sync_exams`를 수동 실행합니다. 별도 백그라운드 워커는 없습니다.

### 실전 이탈 경고와 재입장 차단

PBT·IBT의 읽기·듣기 실전에서 목록·다른 페이지로 이동하거나 로그아웃하려 하면
“시험을 종료하고 나가시겠습니까? 지금까지 저장된 답안으로 채점됩니다.
종료 후에는 이 시험을 이어서 풀 수 없습니다.” 확인창을 표시합니다.
`계속 풀기`는 응시를 유지하고, `시험 종료하고 나가기`는 저장 중인 답안이 끝난 뒤
기존 제출 API의 성공을 확인하고 이동합니다. 저장 답안·문항 스냅샷·채점 결과를 삭제하지 않습니다.
연습 모드의 저장·이탈·이어풀기는 그대로입니다. 단순 탭 전환·창 최소화는 실전을 종료하지 않습니다.

새로고침·탭 닫기는 브라우저 기본 경고창을 사용합니다. 브라우저 제한으로 문구를 지정할 수 없으며,
모바일 앱 강제 종료 등에서는 경고나 종료 요청이 생략될 수 있습니다.
페이지 이탈 시 기존 제출 API에 `keepalive` 요청을 보내며, 전달되지 않아도 다른 페이지 세션으로
재입장하면 서버가 기존 응시를 저장된 답안으로 마감합니다. 실전 목록에는 이어풀기가 없으며,
미마감 기록은 `종료하고 결과 보기`로 마감할 수 있습니다. 다시 풀기는 새 응시를 생성합니다.

신규 API는 `POST /api/pbt/attempts/<id>/enter/`, `POST /api/ibt/attempts/<id>/enter/`입니다.
`{"sessionToken":"<UUID>"}`를 받아 첫 실전 입장을 등록하고 문제를 반환합니다.
동일 토큰의 재요청은 허용하지만 다른 토큰으로 재입장하면 기존 응시를 제출 상태로 반환합니다.
연습은 토큰이 바뀌어도 이어풀기가 가능합니다. 모든 입장 요청은 소유권·시험 방식·CSRF를 검사합니다.
진행 중 실전의 상세 조회·답안 저장에는 `X-Exam-Session` 헤더가 필요하며, 없거나 다르면
`409 attempt_session_required`를 반환합니다. 토큰은 페이지 메모리에만 두며 저장소·URL에 남기지 않습니다.

새 테이블은 없습니다. `migration/pbt/0008_attempt_timed_session_token_hash.py`가
`pbt_attempts.timed_session_token_hash`에 최대 64자의 문자열 컬럼을 추가합니다.
기본값은 빈 문자열이며 첫 입장 토큰의 SHA-256 해시를 저장해 실전 재입장을 구분합니다.
기존 응시·답안·점수는 수정하거나 일괄 마감하지 않으며, 기존 진행 중 실전도 첫 입장 후 같은 규칙을 따릅니다.

**로컬 적용:** 새 백엔드를 실행하기 전에 사용자가 `backend/`에서 아래 명령을 **수동 실행**합니다.
DB 컬럼을 추가하고 다른 미적용 migration도 적용하는 명령이며 에이전트는 로컬 DB에 실행하지 않습니다.

```powershell
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate
```

운영은 기존 `deploy/start.sh`가 `migrate --noinput` 후 Gunicorn을 시작하는 절차를 유지합니다.
프론트엔드와 백엔드를 함께 반영해야 하며 별도 관리 명령·워커·정리 작업은 없습니다.
검증은 분리된 PostgreSQL 테스트 설정에서 `backend/`의
`.\.venv\Scripts\python.exe manage.py test pbt question_bank surveys.tests.test_learner_csv_admin --noinput`,
`frontend-TOPIQ/`의 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`를 사용합니다.

### API와 데이터

기존 테이블 세 개를 공유합니다. 이번 IBT 지원으로 새 테이블은 추가하지 않습니다.

| 테이블 | 목적 |
|---|---|
| `pbt_exams` | 시험 방식, 원본 세트 UUID, 제목·회차, 영역, 공개 여부, 비회원 슬롯 |
| `pbt_attempts` | 응시 시점 시험 방식, 사용자·비회원, 모드, 시작·마감·제출 시각, 상태·점수·푼 문제 수 |
| `pbt_attempt_items` | 문제·정답·해설·대본·미디어·묶음 스냅샷과 답안·채점 결과 |

새 응시는 `pbt_attempts`만 생성하며, `pbt_attempt_items`는 답안을 처음 입력할 때 생성합니다.
객관식 선택을 지우거나 IBT 문장 배열을 모두 비우면 새 방식의 해당 문항 기록을 삭제합니다.
문장 배열을 일부 배치한 상태는 이어풀기를 위해 저장하지만 `answered_count`에는 포함하지 않습니다.
답안 수정은 기존 문항 스냅샷을 유지하며, 완전히 지운 뒤 다시 답하면 현재 문제은행 내용으로 새로 저장합니다.

IBT 읽기 4~7번은 저장된 문항 ID·문제 내용·정답이 현재 문제은행과 일치하면 조회 응답의 자료 이미지 주소만 최신 값으로 표시합니다.
기존 응시·결과 화면에 적용하며 저장된 스냅샷·선택 답안·정답·해설·점수는 변경하지 않습니다.
이미지는 현재 문항의 내용 해시와 일치하는 유효한 자료 이미지만 사용합니다. 기존 전체 스냅샷 응시는
문제은행이 없거나 검증에 실패하면 기존 이미지를 유지합니다. 운영 문제은행에 새 이미지가 등록되어 있어야 하며,
백엔드 재배포 후 화면을 다시 열면 적용됩니다. 새 API·테이블·컬럼·migration이나 별도 실행 명령은 없습니다.

응시·결과 조회는 저장된 문항과 문제은행의 미응답 문항을 합쳐 PBT 50문항·IBT 30문항을 반환합니다.
조회나 제출 때문에 미응답 문항 기록을 생성하지 않습니다. 미응답은 0점이며 IBT 점수의 분모는 항상 30입니다.
저장하지 않은 문항은 문제은행 수정 사항이 반영됩니다. 새 답안을 저장할 때는 세트의 공개 상태와 전체 문항 번호를 확인한 뒤
해당 문항의 내용과 미디어를 검사합니다. IBT 듣기 15~30번과 읽기 23~30번은 짝 문항도 함께 검사합니다.
세트가 삭제·비공개되거나 번호가 불완전할 때, 또는 저장할 문항이나 그 짝이 유효하지 않을 때는 `409 exam_not_ready`를 반환합니다.
응시 중 다른 문항의 미디어가 바뀌어 오류가 생겨도 정상 문항의 답은 저장할 수 있습니다.
새 시험 시작과 문제은행에서 전체 세트를 읽는 요청은 모든 문항을 검증합니다. 이미 저장된 답안의 수정·제출·채점은 기존 스냅샷을 사용합니다.

기존 문항과 응시 기록을 일괄 수정·삭제하지 않습니다. 기존 문항은 답안 취소 시에도 행과 스냅샷을 유지합니다.
새로 저장하는 문항만 기존 JSON `snapshot`에 내부 표식 `_answerOnly: true`를 저장하여 구분하며,
이 표식은 API 응답에 포함하지 않습니다. 신규 API·테이블·컬럼 추가·변경은 없고 migration도 없습니다.
백엔드 변경 적용 이후 새로 시작하는 응시부터 사용하며, 별도 수동 명령·워커·데이터 정리는 필요하지 않습니다.
검증은 `backend/`에서 분리된 PostgreSQL 테스트 설정으로
`.\.venv\Scripts\python.exe manage.py test pbt question_bank surveys.tests.test_learner_csv_admin --noinput`을 수동 실행합니다.
테스트 러너는 임시 테스트 DB만 생성·삭제하며 개발·운영 DB에는 migration을 적용하지 않습니다.

기존 `/api/pbt/` API를 유지하며 아래 IBT API를 추가합니다.

| HTTP 메서드 | 경로 | 목적 |
|---|---|---|
| GET | `/api/ibt/exams/` | IBT 시험 목록·접근 가능 여부·회원의 모드별 최근 결과와 진행 중 응시 |
| POST | `/api/ibt/attempts/` | 응시 시작·재개, `restartAttemptId` 지정 시 기존 응시 마감 후 새 응시 시작 |
| GET | `/api/ibt/attempts/` | 본인의 최근 IBT 응시 100개 |
| GET | `/api/ibt/attempts/<id>/` | 본인 응시 상태·문제·저장 답안 |
| PUT | `/api/ibt/attempts/<id>/answers/<position>/` | 객관식은 `selectedOption` 1~4 또는 `null`, 드래그 배열은 `selectedOrder` 네 칸 저장 |
| POST | `/api/ibt/attempts/<id>/submit/` | 멱등 제출·채점 |
| GET | `/api/ibt/attempts/<id>/result/` | 제출 후 점수·정답·해설·대본. 비회원 응시는 이메일 링크 인증 필요 |

PBT는 위 경로에서 `ibt`를 `pbt`로 바꾼 동일한 API를 사용합니다.
시작 요청은 `examId`, `mode`를 받으며 선택적으로 `restartAttemptId`(기존 응시 UUID)를 받습니다.
목록의 **풀기 시작**은 같은 세트·같은 모드의 진행 중 응시가 있으면 이 ID를 함께 보내 재시작합니다.
기존 응시는 저장된 답안으로 채점·제출되며 미응답은 오답입니다. 기록과 결과를 보존하고 회원의 최근 점수에도 반영합니다.
새 응시는 빈 답안으로 시작하고 실전 제한 시간도 새로 부여합니다. 연습의 **이어풀기**는 기존 응시 화면으로 이동합니다.
서버는 본인 계정 또는 현재 비회원 세션 소유의 동일 시험 방식·세트·모드인지 확인합니다.
문제 준비 상태와 요청 제한을 확인한 뒤 기존 응시 마감과 새 응시 생성을 한 트랜잭션에서 처리합니다. 생성 실패 시 기존 응시도 유지합니다.
같은 재시작 요청을 반복하면 현재 진행 중인 응시를 반환하고 추가로 마감하지 않습니다.
대상이 이미 마감되었고 진행 중인 응시도 없으면 `409 attempt_closed`를 반환하므로 목록을 새로 조회한 뒤 시작합니다.
`restartAttemptId`를 생략하면 기존처럼 진행 중 응시를 재개하거나 새 응시를 생성합니다. DB 구조 변경이나 별도 실행 명령은 필요 없습니다.
목록·응시 응답의 `examFormat`은 `pbt` 또는 `ibt`, `maxScore`는 100입니다.
목록의 `questionCount`·`durationSeconds`와 응시 문항 수를 이용해 화면을 표시합니다.
목록의 `freeAvailable`은 Free 대상 세트를, `accessible`은 현재 계정의 응시 권한을 표시합니다. `myProgress`는 회원에게 모드별 `latestResult`와 `inProgressId`를 제공합니다.
문제의 `groupId`가 같으면 공통 지문·음원 묶음입니다. 기존 PBT 스냅샷에는 이 필드가 없을 수 있습니다.
IBT 문항의 `points=1`은 정답 수 집계용 원점수이며 최종 `score`는 100점 환산값입니다.

변경 요청은 CSRF 검사를 수행하고 응답은 `private, no-store`입니다.
제출 전에는 표시 필드만 반환하며 정답·해설·듣기 대본이나 원본 `content_json`을 노출하지 않습니다.
서버 마감 이후 답안 변경은 거절합니다. 열린 화면은 시간 종료 시 제출을 요청하고,
브라우저가 닫혀 있으면 다음 조회·저장·제출 요청에서 마감 시각 기준으로 확정합니다.
답안 저장과 제출은 같은 응시 행을 잠가 중복 채점과 채점 중 답안 변경을 방지합니다.
응시 시작은 시험 방식·소유자별 시간당 30회로 제한합니다.

검증은 `backend/`에서 `.\.venv\Scripts\python.exe manage.py test pbt question_bank --noinput`,
`frontend-TOPIQ/`에서 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`로 실행합니다.
백엔드 테스트는 격리된 PostgreSQL 테스트 DB에 합성 문제를 만들어 시험 방식 분리, 기존 PBT 보존,
마이그레이션, 동기화 옵션, 비회원 제한, 소유권, CSRF, 시간 만료, 저장·채점·스냅샷·미디어를 확인합니다.

### 응시별 푼 문제 수

`pbt_attempts.answered_count`는 정답 여부와 관계없이 답변을 완료한 문항 수입니다.
NULL을 허용하지 않는 0 이상의 작은 정수 필드이며 기본값은 0입니다. PBT·IBT, 회원·비회원,
연습·실전에 공통 적용합니다. 문항의 응시 당시 `snapshot.answerMode`가 `sentence_order`이면
`selected_order` 네 칸에 `(가)~(라)`가 중복 없이 모두 있어야 1문제로 셉니다.
나머지 문항은 `selected_option`이 NULL이 아니면 포함합니다. `answered_at`은 집계 기준이 아닙니다.

새 응시는 0으로 시작합니다. 답안 저장·변경·취소 시 해당 문항의 완료 상태가 바뀌면 1을 더하거나 뺍니다.
선택지만 바꾸거나 같은 답안을 다시 보내면 완료 문항 수를 유지합니다.
기존 응시 행 잠금과 트랜잭션 안에서 답안·집계값을 함께 저장합니다. 제출·재시작으로 인한 마감·
시간 초과 처리 시에도 다시 집계합니다. 시간 초과는 기한 이후 API 요청이 들어올 때 처리합니다.
시작·재개, 응시 목록·상세, 제출·결과 API의 응시 객체에는 `answeredCount`가 포함됩니다.
답안 저장 성공 응답의 형식은 유지하며, 마감된 응시 오류 응답의 `attempt`에도 집계값을 포함합니다.
관리자 시험 후 설문 CSV는 `점수` 다음에 `푼 문제 수`를 출력하며, 저장된 값을 읽고 0도 표시합니다.

`migration/pbt/0007_attempt_answered_count.py`가 컬럼을 추가하고 기존 진행 중·제출 완료 응시를
500건 단위로 집계합니다. 기존 답안·점수·스냅샷은 변경하지 않습니다.
로컬에서는 새 백엔드를 시작하기 전에 사용자가 `backend/`에서 다음을 **수동 실행**합니다.

```powershell
$env:DJANGO_ENV = 'development'
.\.venv\Scripts\python.exe manage.py migrate
```

이 명령은 컬럼 추가와 기존 기록 집계, 다른 미적용 migration을 적용합니다.
에이전트와 로컬 개발 서버는 자동 적용하지 않습니다. 운영은 기존 `deploy/start.sh`가
`migrate --noinput`을 **자동 실행**한 뒤 Gunicorn을 시작합니다. 별도 집계 명령·워커·예약 작업은 없습니다.
신규 API·테이블은 없고 DB 컬럼은 `pbt_attempts.answered_count` 한 개가 추가됩니다.

분리된 PostgreSQL 테스트 설정에서 `backend/`를 실행 위치로 아래 명령을 사용합니다.
테스트 러너가 격리된 테스트 DB를 생성·삭제하며 실제 개발·운영 DB에는 migration을 적용하지 않습니다.

```powershell
.\.venv\Scripts\python.exe manage.py makemigrations pbt --check --dry-run
.\.venv\Scripts\python.exe manage.py test pbt surveys.tests.test_learner_csv_admin --noinput
```

답 변경·취소·중복 저장·동시 요청, 순서형 부분 입력·완성, 제출·시간 초과·재시작,
기존 기록의 배치 집계와 원본 보존, API·CSV의 숫자 및 0 출력을 검증합니다.

### 기존 비회원 응시 기록의 결과 이메일·별점·사후 설문

이전에 비회원으로 응시한 PBT·IBT의 읽기·듣기, 연습·실전에 공통 적용합니다. 시험 제출 후 당시 브라우저에서 로그인하고
`/<format>/attempts/<id>/feedback`에서 이메일, 1~5점 별점, 설문과 수집·이용 동의를 입력합니다.
결과 메일의 링크를 열어야 점수·정답·정오답·해설·듣기 대본을 확인할 수 있습니다.
회원 계정으로 시작한 응시는 기존처럼 조회합니다. 회원가입 설문은 아래의 별도 가입 흐름에서 수집합니다.

설문은 국적, 출생연도(1950~KST 올해), TOPIK 응시 목적(복수 선택), 기타 목적(선택 시 필수, 500자),
한국어 학습 기간, TOPIK II 응시 경험, 현재 급수(응시 경험이 있으면 0~6), 목표 급수(3~6)를 받습니다.
`0`은 급수 없음이고, 응시 경험이 없으면 현재 급수는 NULL입니다. 별점은 정수만 허용합니다.
설문 선택 코드·번역은 `backend/surveys/survey_catalog.json`과 `frontend-TOPIQ/src/lib/survey-catalog.json`에
동일하게 보관합니다. 두 배포가 독립적이므로 양쪽을 함께 수정하며 계약 테스트로 일치 여부를 검사합니다.
설문·동의 문구를 바꿀 때는 해당 버전도 갱신합니다.

신규 테이블은 **`exam_attempt_feedback` 하나**입니다. 기존 `pbt_attempts`와 1:1로 연결해
이메일·별점·언어, 설문 답변, 최초 설문/동의 버전·시각, 토큰 해시·만료·최초 열람 시각,
메일 상태·요청·접수 시각, 생성·수정 시각을 저장합니다. 이메일 중복은 허용하며 기존 응시는 수정하지 않습니다.
Django 관리자에서 시험 방식·영역·별점·언어·메일 상태로 필터링하고 이메일로 검색할 수 있습니다.
관리 화면은 조회 전용이고 토큰 해시는 표시하지 않습니다. 개인정보 조회는 해당 모델 조회 권한이 있는 관리자만 가능합니다.

신규 API (`<format>`은 `pbt` 또는 `ibt`):

| 메서드 | 경로 | 목적 |
|---|---|---|
| POST | `/api/<format>/attempts/<id>/result-email/` | 해당 응시 소유 세션에서 입력 저장 및 결과 메일 발송·재발송 |
| POST | `/api/<format>/result-access/` | `attemptId`, `token` 검증 후 현재 브라우저에 해당 결과 조회 권한 부여 |

첫 발송은 `email`, `rating`, `language`(`ko`/`en`/`id`), `survey`를 받습니다.
`survey` 키는 `nationalityCode`, `birthYear`, `topikReasons`, `topikReasonOther`, `koreanStudyDuration`,
`topikExperience`, `currentTopikLevel`, `targetTopikLevel`, `privacyConsent`(true), `privacyConsentVersion`입니다.
현재 동의 버전은 `topiq_exam_privacy_v1`입니다. 재발송은 `survey`를 생략할 수 있으며,
기존 설문과 동의 시각을 덮어쓰지 않습니다. 응시 상세·목록·제출 응답은 `guestAttempt`, `resultAccess` 및
비회원의 `feedback` 완료·메일 상태를 제공합니다. 미인증 비회원의 `score`는 NULL입니다.
접근이 잠긴 결과 API는 소유자에게 `403 result_email_required`, 다른 사람에게 404를 반환합니다.

결과 링크는 **7일** 유효하고, 토큰은 URL fragment(`#token=...`)로 전달한 뒤 화면에서 제거합니다.
서버에는 원문을 저장하지 않습니다. 다른 브라우저에서도 링크로 결과만 조회할 수 있으며
응시 상세·답안 수정·재발송 권한은 생기지 않습니다. 열람 권한도 링크 만료 시 함께 끝납니다.
재발송할 때 새 토큰으로 교체하므로 **기존 링크와 그 링크로 얻은 조회 권한은 만료**됩니다.
재발송은 최초 응시 브라우저 세션이 필요합니다. 쿠키 삭제·로그아웃으로 소유 세션을 잃으면 재발송할 수 없습니다.

메일은 기존 `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `TOPIQ_PUBLIC_URL` 설정을 사용합니다.
프론트엔드에 키를 전달하지 않습니다. 발송은 요청 안에서 실행하며 별도 작업자·스케줄·실행 명령은 없습니다.
설문과 발송 요청은 메일 호출 전에 커밋하므로 실패해도 설문은 보존됩니다.
`accepted`는 Brevo 접수 완료이며 실제 도착을 보장하지 않습니다. 타임아웃 등 접수 여부가 불명확하면
`uncertain`으로 표시하고 자동 재발송하지 않습니다. 받은 편지함을 확인한 뒤 수동 재시도합니다.
프로세스 중단으로 `sending` 상태가 남아도 재발송 제한 시간이 지나면 수동 재시도할 수 있습니다.
재발송 간격은 60초, 발송 시도는 응시·수신 이메일별 시간당 5회, 요청 IP별 시간당 100회입니다.
링크 검증 요청도 IP별 10분당 100회로 제한합니다. 제한 시 `429`와 `Retry-After`를 반환합니다.
모든 POST는 CSRF 검사, 응답은 `private, no-store`를 사용하고 개인정보·토큰을 로그에 기록하지 않습니다.

**적용:** 코드를 반영한 뒤 새 백엔드를 실행하기 전에 개발자가 `backend/`에서 수동 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py migrate
```

이 명령은 `migration/pbt/0003_exam_attempt_feedback.py`를 포함한 미적용 마이그레이션을 적용하며,
신규 테이블 및 별점·급수 제약을 생성합니다. 에이전트나 개발 서버가 로컬에 자동 적용하지 않습니다.
운영은 기존 `deploy/start.sh`가 마이그레이션 → 정적 파일 수집 → Gunicorn 시작을 자동 수행합니다.
백엔드 적용 후 프론트엔드를 배포합니다. 메일 설정이 없으면 발송 실패로 표시되므로 활성화 전에 설정을 확인합니다.

**검증:** 개발·운영과 분리된 PostgreSQL 테스트 DB 및 합성 데이터로 `backend/`에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py test pbt accounts question_bank --noinput
```

Django 테스트 러너는 `test_<DB_NAME>` 테스트 DB를 생성·삭제합니다. 운영 연결 설정으로 실행하지 않습니다.
메일은 테스트에서 대체하므로 실제 이메일은 보내지 않습니다. 서버 입력 검증, 소유권, 점수·정답 비공개,
교차 브라우저 열람, 토큰 변조·만료·교체, 재발송·동시 요청, 기존 회원가입 메일과 응시 기능을 확인합니다.
`frontend-TOPIQ/`에서는 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`를 실행합니다.


### TOPIQ 회원가입 학습 설문

회원가입은 이메일 인증 → 닉네임·비밀번호 설정 → 학습 설문 → 가입 완료 순서입니다.
계정 설정과 설문 사이를 이동해도 입력값을 유지하고, 비밀번호와 설문을 브라우저 저장소에 저장하지 않습니다.
가입 설문에는 별점이 없으며 이메일은 인증된 회원 정보를 사용합니다. 기존 회원에게 설문을 소급 요구하지 않습니다.

신규 API는 없습니다. 기존 `POST /api/auth/signup/`는 계정 필드(`email`, `nickname`, `password`,
`password_confirm`, `verification_token`)와 함께 `language`(`ko`/`en`/`id`), `survey` 객체를 필수로 받습니다.
`survey`의 문항 키와 조건부 검증은 위 시험 설문과 같으며, 가입 동의 버전은 `topiq_signup_privacy_v1`입니다.
시험용 동의 버전으로 가입할 수 없습니다. 설문 버전 `signup_survey_v1`과 완료·동의 시각은 서버가 기록합니다.
인증 토큰은 최종 제출 시에도 검증하며, 계정과 설문을 하나의 트랜잭션으로 저장한 뒤에만 자동 로그인합니다.
검증 오류는 기존 `400 validation_error`와 `fields`에 반환합니다. 구버전 클라이언트는 설문 없이 가입할 수 없으므로
백엔드와 프론트엔드를 같은 배포 작업에서 반영합니다.

신규 테이블 **`signup_survey_responses`**는 `auth_user`와 1:1로 연결됩니다. 언어, 국적, 출생연도,
응시 목적·기타 목적, 학습 기간, 응시 경험, 현재·목표 급수, 설문/동의 버전과 시각을 저장합니다.
이메일은 사용자 관계에서 참조하고 별점·결과 메일 필드는 저장하지 않습니다.
Django 관리자에서 조회 권한이 있는 담당자만 이메일·닉네임으로 검색하고 언어·국적·목표 급수·완료 시각으로
필터링할 수 있습니다. 가입 당시의 기록이므로 관리자 화면에서는 추가·수정·삭제하지 않습니다.
기존 시험 설문과 가입 설문은 각 응답 시점의 기록이며, 답변을 자동 복사하거나 통합하지 않습니다.

문항·서버 검증은 `backend/surveys/learner.py`, 프론트 문항·검증은
`frontend-TOPIQ/src/lib/learner-survey.ts`, 공통 입력 UI는 `components/LearnerSurveyForm.tsx`에서 관리합니다.
가입과 시험의 동의 문구·버전은 각각 관리하고 카탈로그 일치 여부는 테스트로 확인합니다.

**로컬 적용:** 코드를 받은 뒤 새 백엔드를 시작하기 전에 개발자가 `backend/`에서 수동 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py migrate
```

`migration/surveys/0002_signup_survey_response.py`가 새 테이블, 회원 1:1 관계와 급수 제약을 생성합니다.
이 명령은 다른 미적용 마이그레이션도 함께 적용할 수 있습니다. 에이전트와 개발 서버는 로컬에 자동 적용하지 않습니다.
운영에서는 기존 `deploy/start.sh`가 migration 후 Gunicorn을 시작하는 절차를 유지합니다.
추가 환경 변수, 백그라운드 작업자, 관리 명령은 필요하지 않습니다.

**검증:** 개발·운영과 분리된 PostgreSQL 테스트 연결 설정으로 `backend/`에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe manage.py test accounts pbt surveys --noinput
```

Django 테스트 러너가 테스트 DB를 생성·삭제하며 실제 이메일은 보내지 않습니다. 가입 필수 설문, 동의 버전,
조건부 문항, 중복 가입, 계정·설문 원자적 저장, 기존 인증 및 PBT/IBT 설문을 확인합니다.
프론트엔드는 `frontend-TOPIQ/`에서 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`로 검증합니다.

### 회원가입·시험 후 설문 CSV 다운로드

Django 관리자에서 아래 목록을 열고 검색·필터를 지정한 뒤 우측 상단 **CSV 다운로드**를 누릅니다.
현재 페이지뿐 아니라 검색·필터에 맞는 모든 응답을 한 건당 한 행으로 내려받습니다.
파일명에는 한국 시간 기준 다운로드 시각이 들어갑니다.

| 관리자 목록 | 다운로드 경로 | 파일명 접두어 |
|---|---|---|
| Surveys → Signup survey responses | `GET /admin/surveys/signupsurveyresponse/export-csv/` | `signup_survey_responses_` |
| Pbt → Exam attempt feedbacks | `GET /admin/pbt/examattemptfeedback/export-csv/` | `exam_attempt_feedback_` |

가입 설문 CSV에는 회원 ID, 회원의 현재 이메일·닉네임, 응답 언어와 전체 설문 답변,
설문·동의 버전 및 시각이 들어갑니다. 별점은 포함하지 않습니다.
시험 후 설문 CSV에는 응시 ID, 결과 수신 이메일, PBT/IBT, 응시 당시 시험명·영역·모드,
점수·푼 문제 수·별점·언어·시험 제출 시각·메일 상태와 전체 설문 답변, 설문·동의 버전 및 시각이 들어갑니다.
시험 후 설문이 저장된 응시만 대상으로 하며, 결과 인증 토큰·해시는 내보내지 않습니다.

열 이름과 선택 항목명은 한국어이고, 국적은 국가 코드, 응답 언어는 `ko`/`en`/`id`로 표시합니다.
복수 응시 목적은 `; `로 구분합니다. 현재 급수의 NULL은 빈 셀, 0은 `급수 없음`으로 표시하고
점수와 푼 문제 수 0은 그대로 보존합니다. 시각은 `+09:00`이 포함된 한국 시간 ISO 형식입니다.
UTF-8 BOM과 CSV 인용 처리를 적용해 Excel에서 한글·쉼표·따옴표·줄바꿈을 보존합니다.
수식처럼 보이는 사용자 입력은 CSV에서만 텍스트로 처리하며 원본 데이터는 변경하지 않습니다.

활성 관리자 계정이면서 해당 모델 조회 권한이 있어야 목록과 다운로드에 접근할 수 있습니다.
회원가입 설문과 시험 설문의 권한은 각각 적용합니다. 잘못된 필터는 오류를 반환하며 필터를 풀어
전체 데이터를 내보내지 않습니다. 결과가 없으면 열 이름만 있는 CSV를 제공합니다.

CSV 다운로드는 기존 관리자 전용 GET 경로 두 개를 사용합니다. 푼 문제 수 출력에는 위
`0007_attempt_answered_count` migration 적용이 필요합니다. 적용 후 관리자 화면에서 수동 다운로드합니다.
CSV 전용 실행 명령·예약 작업·환경 변수나 프론트엔드 배포는 필요하지 않습니다.

분리된 PostgreSQL 테스트 설정에서 `backend/`를 실행 위치로 사용해 검증합니다.

```powershell
.\.venv\Scripts\python.exe manage.py test surveys pbt.tests.test_feedback accounts.tests.test_signup_survey --noinput
```

Django 테스트 러너가 테스트 DB를 생성·삭제하며 운영·개발 DB 설정으로 실행하지 않습니다.
권한 분리, 읽기 전용 관리자 목록의 버튼, 검색·필터와 페이지 처리, CSV 형식·수식 처리,
토큰 제외와 원본 데이터 보존, 관련 회원·시험 정보를 조회할 때 불필요한 반복 쿼리가 없는지 확인합니다.

환불 정책 변경은 DB 구조 변경이나 추가 migrate 없이 배포합니다. Stripe 제한 키를 사용하는 경우 구독 취소를 위한 Subscriptions 쓰기 권한과 환불·결제·청구서 조회 권한을 허용해야 합니다.

환불 정책 회귀 검증은 `backend/`에서 `.venv/bin/python manage.py test accounts.tests.test_refund_policy accounts.tests.test_credit_refunds accounts.tests.test_credit_purchases --noinput`으로 실행합니다. 이는 수동 개발 검증이며 실제 서비스 DB 대신 Django 테스트 DB를 사용합니다. DB 구조 변경은 없습니다.
