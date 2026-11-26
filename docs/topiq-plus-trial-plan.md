# TOPIQ Plus 7일 무료 체험 최종 계획서

월간 Plus는 신규 신청 시 7일 무료 체험으로 시작한다. 체험 중 해지를 예약하면 종료일까지 이용하고 첫 구독료는 0원이다. 구독을 유지하면 Stripe가 등록 카드로 월 9,900원 결제를 시도한다. 3개월권과 6개월권은 가입 시 첫 회차 금액을 바로 결제한다.

## 1. 상품과 가입 자격

| 상품 | 가입 시 | 첫 청구 및 갱신 | 플랜 화면의 버튼 |
|---|---|---|---|
| 1개월 Plus | 7일 무료 체험 필수 | 체험 종료 후 9,900원, 이후 매월 9,900원 | 7일 무료 체험 시작 |
| 3개월 Plus | 23,900원 결제 | 이후 3개월마다 23,900원 | 23,900원 결제하고 시작 |
| 6개월 Plus | 43,900원 결제 | 이후 6개월마다 43,900원 | 43,900원 결제하고 시작 |

- **계정당 1회, 카드당 1회.** 계정과 카드가 모두 처음 체험할 때 월간 가입을 허용한다. 체험이 시작됐다면 첫 결제 전에 해지해도 사용 이력이 남는다. 체험을 사용한 계정이 해지 후 다시 가입할 수 있는 상품은 3·6개월권이다.
- **기존 유료 회원도 신청 가능하다.** 3·6개월권 결제 이력은 체험 사용 이력에 포함하지 않는다. 해당 이용 기간이 끝나고 열린 구독이 없으면, 체험 이력이 없는 계정과 카드로 월간 체험을 시작할 수 있다. 기존 월간 구독의 정기 갱신에는 체험을 다시 부여하지 않는다.
- **체험 혜택은 즉시 이용할 수 있는 Plus 콘텐츠다.** 공개 PBT·IBT 모의시험과 Plus 단어장을 연다. 쓰기 세트는 기존 크레딧으로 이용한다. 월 400크레딧은 첫 9,900원 결제가 성공했을 때 한 번 지급하고 이후 유료 기간에는 기존 월별 기준을 따른다.

## 2. 월간 가입과 카드 중복 검사

**Stripe가 카드를 등록하고 식별값을 제공한다. TOPIQ 백엔드가 자사 체험 이력과 비교해 가입을 결정한다.** 프론트는 사용자가 입력한 카드번호를 받거나 카드 중복을 판정할 필요가 없다. [Stripe 카드 등록](https://docs.stripe.com/payments/checkout/save-and-reuse) · [Stripe 카드 식별값](https://docs.stripe.com/api/cards/object#card_object-fingerprint)

| 단계 | 사용자에게 보이는 동작 | 서버 처리 |
|---|---|---|
| ① 월간 선택 | 오늘 0원, 체험 종료 후 월 9,900원, 해지 방법을 확인한다. | 로그인 계정의 체험 이력과 열린 구독을 확인한다. 월간 신청에 카드 등록용 Stripe Checkout(`mode=setup`)을 생성한다. |
| ② 카드 등록 | Stripe의 카드 입력 화면을 거쳐 TOPIQ로 돌아온다. | 서명된 알림 또는 서버의 Stripe 조회를 통해 주문·고객·등록 성공 여부를 확인한다. 등록된 `PaymentMethod.card.fingerprint`를 읽고 동일 카드의 체험 이력을 확인한다. |
| ③ 체험 시작 | 처음 유료로 전환되는 예정 일시, 0원 → 월 9,900원, 등록 카드 자동결제, 해지 방법을 확인하고 동의한다. | 사용자에게 제시한 조건을 주문에 연결한다. 계정과 카드 자격을 다시 확인해 한 주문만 확보하고 해당 카드로 월간 Stripe 구독을 생성한다. 성공하면 실제 체험 기간을 기록하고 Plus를 연다. |
| ④ 종료 또는 전환 | 구독 관리에서 첫 결제 예정일과 해지 버튼을 확인한다. 해지 예약 후에는 ‘자동 결제 없음’과 이용 종료일을 표시한다. | 체험 종료 시각이 지나면 체험 권한은 만료된다. 정가 결제 성공 알림이 확인되면 해당 청구 기간의 유료 권한과 첫 400크레딧을 반영한다. 실패 후 재결제가 성공한 경우도 동일하게 처리한다. |

**카드 판정 범위.** 월간 체험에는 Stripe에 직접 입력한 카드를 받는다. Apple Pay·Google Pay 등은 같은 실물 카드도 지갑용 번호를 반환할 수 있어 직접 입력을 안내한다. 식별값이 없으면 등록을 다시 시도하게 한다. 카드번호가 달라진 재발급 카드까지 같은 카드로 판별할 수는 없다. 비교용으로 서버에서 계산한 HMAC만 저장하고 카드번호·CVC·원본 식별값은 로그나 응답에 쓰지 않는다. 3·6개월 유료 신청에는 체험용 카드 제한을 적용하지 않는다. [Stripe의 카드 식별 범위](https://docs.stripe.com/api/cards/object#card_object-fingerprint)

**중복과 중단 처리.** 다른 계정에서 사용한 카드라면 ‘이미 무료 체험에 사용한 카드입니다’라고 표시한다. 해당 계정 자체에 체험 이력이 없다면 다른 카드로 다시 시도할 수 있다. 카드 등록만 마쳤거나 최종 동의 전에 창을 닫은 경우에는 기회를 소진하지 않는다. 구독 생성 요청 후 응답을 잃으면 동일 주문으로 Stripe 결과부터 대조한다. 구독 생성이 끝내 실패한 것으로 확인된 경우에만 계정·카드에 걸어 둔 예약을 해제한다.

**유료 전환 동의.** 화면에 제시한 전환 일시와 금액을 Stripe 구독 조건과 맞추고, 유효 시간이 지나 조건이 달라졌다면 최신 일시를 제시해 동의를 받는다. 국내 통신판매에 적용되는 전자상거래법은 유료 전환 전 30일 이내에 전환 일시·가격·결제방법에 동의를 받고 취소·해지 조건과 효과를 고지하도록 정한다. 이 계획에서는 월간 체험 신청 과정에서 해당 구독 조건에 명시적으로 동의하도록 하고 동의 시각과 안내문 버전을 기록한다. [전자상거래법 제13조 제6항](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1027063773) · [같은 법 시행령 제20조의2](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034118783)

## 3. 데이터와 결제 처리

`plus_free_trials` 테이블을 신설한다. 체험을 이용하고 해지한 사람은 유료 영수증이 0건이어도 사용 이력이 필요하다. 새 테이블은 그 이력을 보관하고, 기존 `credit_purchases` 원주문에는 Stripe 구독 ID와 실제 청구 회차가 연결된다.

| 새 테이블의 컬럼 | 목적 |
|---|---|
| `purchase_id`, `user_id` | 월간 원주문과 1:1로 연결하고 신청 계정을 식별한다. 서버가 주문 소유자와 같은 계정인지 확인한다. |
| `card_fingerprint_digest` | 서버가 검증한 카드의 비교용 해시. 동일 카드의 동시 신청까지 막는 데 사용한다. |
| `status` | 카드 등록 대기, 동의 대기, 구독 생성 예약, 체험 시작 확정, 중복 거절, 신청 종료를 구분한다. ‘시작 확정’은 체험을 실제로 사용했다는 이력으로 보존한다. 현재 이용 가능 여부는 구독 상태와 이용 시각으로 계산한다. |
| `consented_at`, `consent_version`, `agreed_trial_ends_at` | 사용자가 동의한 시각, 조건의 버전, 유료 전환 예정 시각을 기록한다. 청구 금액과 주기는 원주문 값을 사용한다. |
| `started_at`, `ends_at` | Stripe에서 확인한 실제 체험 시작·종료 시각을 저장한다. |

- **DB 제약**은 구독 생성 예약 또는 시작 확정인 신청에 대해 `user_id`와 `card_fingerprint_digest`에 각각 고유 조건을 둔다. 대기·최종 실패 기록은 재신청을 막지 않는다. 두 계정이 같은 카드로 동시에 요청해도 하나의 예약만 성공한다.
- 기존 `credit_purchases.subscription_state`에 `trialing`을 반영하고, 계정당 열린 구독 1개 제약에도 포함한다. 기존 구매 테이블의 컬럼 추가 계획은 없다. 체험 종료 예약과 실제 종료를 구분하고, 관리자·회원 화면·콘텐츠 API가 같은 Plus 만료 시각을 사용하게 한다.
- 체험 시작의 **0원 청구서**는 검증된 체험 주문과 연결해 수신 처리한다. 첫 정가 청구서는 구독 ID, 상품, 금액 및 청구 기간 시작 시각을 대조해 원주문에 연결한다. Stripe 청구서 ID로 중복 반영을 막아 순서가 뒤바뀐 알림, 중복 전송, 환불 알림 선도착에도 유료 기간과 400크레딧을 한 번만 기록한다. [Stripe 체험 청구 주기](https://docs.stripe.com/billing/subscriptions/trials/free-trials)

## 4. 수정할 파일과 API

| 영역 | 주요 수정 위치와 내용 |
|---|---|
| Django 모델·마이그레이션 | [models.py](../backend/accounts/models.py), [accounts 마이그레이션](../backend/migration/accounts/). 체험 테이블과 고유 제약, 열린 구독 제약을 Django 마이그레이션으로 배포한다. |
| 결제·구독 수명주기 | [payments.py](../backend/accounts/payments.py), [subscriptions.py](../backend/accounts/subscriptions.py). 월간 카드 등록·신청 확정과 3·6개월 즉시 결제를 분기한다. 기존 웹훅에서 카드 등록 완료, 체험 취소, 첫 유료 결제, 결제 지연을 처리한다. |
| Plus 권한·크레딧·환불 | [plans.py](../backend/accounts/plans.py), [views.py](../backend/accounts/views.py), [admin.py](../backend/accounts/admin.py)에서 이용 기간·등급을 일치시킨다. [credits.py](../backend/accounts/credits.py), [refunds.py](../backend/accounts/refunds.py), [plan_changes.py](../backend/accounts/plan_changes.py)에서 유료 회차 적립·환불과 체험 중 주기 변경 제한을 점검한다. |
| TOPIQ 플랜 선택과 복귀 | [PlanOffers.tsx](../frontend-TOPIQ/src/components/credits/PlanOffers.tsx), [PlansAccount.tsx](../frontend-TOPIQ/src/components/credits/PlansAccount.tsx), [CreditPurchase.tsx](../frontend-TOPIQ/src/components/credits/CreditPurchase.tsx). 월간과 장기권의 가격·버튼을 구분하고 카드 확인 중, 동의 대기, 시작, 중복, 재시도 상태를 표시한다. |
| TOPIQ 구독 관리와 공통 데이터 | [SubscriptionSettings.tsx](../frontend-TOPIQ/src/app/settings/subscription/SubscriptionSettings.tsx), [PlanChangeControls.tsx](../frontend-TOPIQ/src/components/credits/PlanChangeControls.tsx), [writing-api.ts](../frontend-TOPIQ/src/lib/writing/writing-api.ts). 첫 유료 전환과 해지 예약을 표시하고, 결제 포털에서 돌아오거나 체험이 끝날 때 실제 권한을 다시 조회한다. |
| 안내·약관·운영 문서 | [플랜 문구](../frontend-TOPIQ/src/lib/plans-content.ts), [이용약관](../frontend-TOPIQ/src/app/terms/page.tsx)에 한국어·영어·인도네시아어로 동일한 가입·해지 조건을 반영한다. 구현 시 [README](../README.md)에 운영 절차를 반영한다. 프론트 변경 대상은 `frontend-TOPIQ/`이다. |

새 공개 API 경로는 추가하지 않는다. 기존 경로는 다음과 같이 확장한다.

| 기존 경로 | 계획 |
|---|---|
| `GET /api/plans/` | 요금제별 가입 조건과 계정의 월간 체험 가능 여부를 반환한다. 카드 자격은 등록 이후에 확정한다. |
| `POST /api/plans/purchases/` | 월간은 같은 원주문으로 카드 등록과 최종 동의·체험 시작을 처리한다. 3·6개월은 기존 정가 Checkout을 생성한다. 요청 가격·상품·조건이 바뀌면 화면을 다시 확인하게 한다. |
| `GET /api/credits/purchases/<id>/?product=plan` | 복귀 화면이 카드 확인·중복 거절·체험 시작·결제 완료를 구분할 수 있도록 주문 결과를 확장한다. |
| `GET /api/subscriptions/me/`, `GET /api/auth/me/` | 구독 조회에 체험 상태·종료일·첫 결제 예정액·해지 예약을 표시한다. 로그인 응답의 `plusEndsAt`에는 체험을 포함한 실제 이용 종료 시각을 반환한다. |
| `POST /api/payments/stripe/webhook/`, `POST /api/credits/billing-portal/` | 기존 서명 검증과 포털을 재사용한다. 카드 등록 완료 알림은 체험 시작 동의와 구분하고, 포털 해지 예약은 체험 종료일까지 반영한다. |

## 5. 출시 검증과 배포

| 시나리오 | 통과 기준 |
|---|---|
| 첫 월간 신청 | 계정·카드가 모두 처음이면 7일 체험, 첫날 구독료 0원, Plus 접근 가능, 보너스 지급 0건 |
| 계정·카드 중복 | 같은 계정·다른 카드와 다른 계정·같은 카드를 각각 차단. 동시에 같은 카드로 두 건을 신청해도 Stripe 체험 구독 1건 |
| 과거 3·6개월권 회원 | 기존 구독 및 이용 기간 종료 후 체험을 쓰지 않은 계정·카드라면 월간 체험 성공 |
| 신청 중단·응답 유실 | 등록창 이탈은 기회 보존. 구독 생성 응답 유실·웹훅 재전송 후에는 기존 주문 한 건으로 복구 |
| 체험 종료 전 해지 | 해지 예약 후 종료일까지 콘텐츠 이용, 이후 Free 전환, 정가 청구·보너스 0건, 체험 재사용 차단 |
| 첫 결제 성공·실패 | 월 9,900원 성공 시 첫 400크레딧 1회. 미결제 시 체험 종료 후 권한 만료, 뒤늦게 결제되면 유료 기간 정상 반영 |
| 기존 상품·화면 | 3·6개월 즉시 결제, 기존 월간 갱신, 환불, 일회성 크레딧 충전을 검증. 세 언어와 모바일에서 금액·전환 시각·해지 경로 확인 |

1. **자동 검증.** `backend/`에서 별도 PostgreSQL 테스트 DB를 사용해 `.\.venv\Scripts\python.exe manage.py test accounts pbt vocabulary --noinput`을 실행한다. `frontend-TOPIQ/`에서는 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`를 실행한다.
2. **Stripe 샌드박스.** 테스트 시계로 체험 종료와 청구를 진행하고, 실제 카드 등록 화면의 지갑 표시·직접 입력·중복 처리와 고객 포털의 기간 말 해지를 확인한다. 브라우저 복귀, 알림 지연·역순, 첫 결제 실패 후 복구도 검증한다. [Stripe Billing 테스트](https://docs.stripe.com/billing/testing)
3. **DB와 배포.** 구현 후 사용자가 `backend/`에서 개발 서버 시작 전에 `.\.venv\Scripts\python.exe manage.py migrate`를 수동 실행한다. 운영은 기존 [start.sh](../backend/deploy/start.sh)가 Gunicorn 시작 전에 마이그레이션을 적용한다. 체험 처리용 백엔드가 준비된 뒤 프론트에 월간 체험을 공개한다.
4. **출시 경계.** 배포 전에 열어 둔 월간 즉시 결제창과 새 0원 안내가 섞이지 않도록 구분한다. 미완료 상태인 기존 월간 결제창은 전환 시 만료시키고 새 조건을 보여 준다. 이미 결제된 기존 주문과 구독은 원래 조건대로 처리한다. 자동 청구와 기간 말 해지는 Stripe가 수행하며, 별도 백그라운드 작업을 추가하지 않는다.
