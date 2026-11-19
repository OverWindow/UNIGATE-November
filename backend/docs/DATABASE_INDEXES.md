# 개발 DB 인덱스 목록 (public · topik_bank)

PostgreSQL 16 개발 DB에서 **2026-11-19 22:03:06 KST**에 조회한 `public`과 `topik_bank` 인덱스 목록이다. 두 스키마의 **32개 테이블**에 인덱스 **96개**가 있다.

## 스키마별 요약

| 스키마 | 인덱스가 있는 테이블 | 기본 키 | 기타 고유 | 일반 | 인덱스 합계 | 부분 인덱스 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [`public`](#public) | 23 | 23 | 21 | 28 | 72 | 5 |
| [`topik_bank`](#topik_bank) | 9 | 9 | 10 | 5 | 24 | 2 |
| **합계** | **32** | **32** | **31** | **33** | **96** | **7** |

**PK**는 기본 키 인덱스, **UNIQUE**는 기본 키 이외의 고유 인덱스, **일반**은 고유성을 강제하지 않는 인덱스다. 부분 인덱스는 해당 유형의 합계에도 포함되며, 표에 표시한 `WHERE` 조건을 만족하는 행만 담는다.

모든 인덱스의 접근 방식은 `btree`이며 조회 시점에 모두 유효했다. 키는 정의 순서대로 표기했다. `DESC`는 내림차순이며, 정렬 방향을 생략한 키는 오름차순이다.

## public

### `accounts_rate_limit`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `accounts_rate_limit_pkey` | PK | `id` |
| `accounts_rate_limit_expires_at_3c8eb07b` | 일반 | `expires_at` |
| `accounts_rate_limit_scope_key_unique` | UNIQUE | `scope, key_hash` |

### `auth_group`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `auth_group_pkey` | PK | `id` |
| `auth_group_name_a6ea08ec_like` | 일반 | `name varchar_pattern_ops` |
| `auth_group_name_key` | UNIQUE | `name` |

### `auth_group_permissions`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `auth_group_permissions_pkey` | PK | `id` |
| `auth_group_permissions_group_id_b120cbf9` | 일반 | `group_id` |
| `auth_group_permissions_group_id_permission_id_0cd325b0_uniq` | UNIQUE | `group_id, permission_id` |
| `auth_group_permissions_permission_id_84c5c92e` | 일반 | `permission_id` |

### `auth_permission`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `auth_permission_pkey` | PK | `id` |
| `auth_permission_content_type_id_2f476e4b` | 일반 | `content_type_id` |
| `auth_permission_content_type_id_codename_01ab375a_uniq` | UNIQUE | `content_type_id, codename` |

### `auth_user`

| 인덱스 이름 | 구분 | 키 (정의 순서) | 부분 인덱스 조건 (`WHERE`) |
| --- | --- | --- | --- |
| `auth_user_pkey` | PK | `id` | — |
| `auth_user_email_ci_unique` | UNIQUE | `lower(btrim((email)::text))` | `(btrim((email)::text) <> ''::text)` |
| `auth_user_username_6821ab7c_like` | 일반 | `username varchar_pattern_ops` | — |
| `auth_user_username_key` | UNIQUE | `username` | — |

### `auth_user_groups`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `auth_user_groups_pkey` | PK | `id` |
| `auth_user_groups_group_id_97559544` | 일반 | `group_id` |
| `auth_user_groups_user_id_6a12ed8b` | 일반 | `user_id` |
| `auth_user_groups_user_id_group_id_94350c0c_uniq` | UNIQUE | `user_id, group_id` |

### `auth_user_user_permissions`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `auth_user_user_permissions_pkey` | PK | `id` |
| `auth_user_user_permissions_permission_id_1fbb5f2c` | 일반 | `permission_id` |
| `auth_user_user_permissions_user_id_a95ead1b` | 일반 | `user_id` |
| `auth_user_user_permissions_user_id_permission_id_14a6b632_uniq` | UNIQUE | `user_id, permission_id` |

### `credit_accounts`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `credit_accounts_pkey` | PK | `user_id` |

### `credit_transactions`

| 인덱스 이름 | 구분 | 키 (정의 순서) | 부분 인덱스 조건 (`WHERE`) |
| --- | --- | --- | --- |
| `credit_transactions_pkey` | PK | `id` | — |
| `credit_evaluation_event_unique` | UNIQUE | `evaluation_id, kind` | — |
| `credit_set_unlock_unique` | UNIQUE | `account_id, set_id` | `((kind)::text = 'unlock'::text)` |
| `credit_tran_account_cc200b_idx` | 일반 | `account_id, created_at DESC` | — |
| `credit_transactions_account_id_b1b3006c` | 일반 | `account_id` | — |
| `credit_transactions_actor_id_3cb229cf` | 일반 | `actor_id` | — |
| `credit_transactions_evaluation_id_f4582630` | 일반 | `evaluation_id` | — |
| `credit_welcome_unique` | UNIQUE | `account_id` | `((kind)::text = 'welcome'::text)` |

### `django_admin_log`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `django_admin_log_pkey` | PK | `id` |
| `django_admin_log_content_type_id_c4bce8eb` | 일반 | `content_type_id` |
| `django_admin_log_user_id_c564eba6` | 일반 | `user_id` |

### `django_content_type`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `django_content_type_pkey` | PK | `id` |
| `django_content_type_app_label_model_76bd3d3b_uniq` | UNIQUE | `app_label, model` |

### `django_migrations`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `django_migrations_pkey` | PK | `id` |

### `django_session`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `django_session_pkey` | PK | `session_key` |
| `django_session_expire_date_a5c62663` | 일반 | `expire_date` |
| `django_session_session_key_c0390e0f_like` | 일반 | `session_key varchar_pattern_ops` |

### `exam_attempt_feedback`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `exam_attempt_feedback_pkey` | PK | `attempt_id` |

### `korean_dictionary_senses`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `korean_dictionary_senses_pkey` | PK | `id` |
| `krdict_lookup_idx` | 일반 | `headword, part_of_speech, entry_type` |
| `krdict_source_unique` | UNIQUE | `source_file, source_row` |

### `pbt_attempt_items`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `pbt_attempt_items_pkey` | PK | `id` |
| `pbt_attempt_items_attempt_id_99cdda15` | 일반 | `attempt_id` |
| `pbt_attempt_position_unique` | UNIQUE | `attempt_id, "position"` |

### `pbt_attempts`

| 인덱스 이름 | 구분 | 키 (정의 순서) | 부분 인덱스 조건 (`WHERE`) |
| --- | --- | --- | --- |
| `pbt_attempts_pkey` | PK | `id` | — |
| `pbt_active_guest_attempt` | UNIQUE | `guest_id, exam_id, mode` | `((guest_id IS NOT NULL) AND ((status)::text = 'in_progress'::text))` |
| `pbt_active_user_attempt` | UNIQUE | `user_id, exam_id, mode` | `(((status)::text = 'in_progress'::text) AND (user_id IS NOT NULL))` |
| `pbt_attempt_guest_i_a47a79_idx` | 일반 | `guest_id, started_at DESC` | — |
| `pbt_attempt_user_id_8196d3_idx` | 일반 | `user_id, started_at DESC` | — |
| `pbt_attempts_exam_id_17270aba` | 일반 | `exam_id` | — |
| `pbt_attempts_user_id_1a7b562c` | 일반 | `user_id` | — |

### `pbt_exams`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `pbt_exams_pkey` | PK | `id` |
| `exam_format_guest_slot_unique` | UNIQUE | `exam_format, section, guest_slot` |
| `pbt_exams_source_set_id_key` | UNIQUE | `source_set_id` |

### `signup_survey_responses`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `signup_survey_responses_pkey` | PK | `user_id` |

### `survey_responses`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `survey_responses_pkey` | PK | `id` |

### `vocabulary_set_items`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `vocabulary_set_items_pkey` | PK | `id` |
| `vocabulary_set_items_set_id_039d245c` | 일반 | `set_id` |
| `vocabulary_set_items_vocabulary_id_key` | UNIQUE | `vocabulary_id` |
| `vocabulary_set_position_unique` | UNIQUE | `set_id, "position"` |

### `vocabulary_sets`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `vocabulary_sets_pkey` | PK | `id` |
| `vocabulary_level_set_unique` | UNIQUE | `topik_level, set_number` |

### `writing_evaluations`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `writing_evaluations_pkey` | PK | `id` |
| `writing_eva_status_4f4f68_idx` | 일반 | `status, expires_at` |
| `writing_eva_user_id_67c158_idx` | 일반 | `user_id, created_at DESC` |
| `writing_evaluations_user_id_273bc910` | 일반 | `user_id` |

## topik_bank

### `item_audio_bindings`

| 인덱스 이름 | 구분 | 키 (정의 순서) | 부분 인덱스 조건 (`WHERE`) |
| --- | --- | --- | --- |
| `item_audio_bindings_pkey` | PK | `binding_id` | — |
| `item_audio_asset_idx` | 일반 | `audio_asset_id, is_current` | — |
| `item_audio_current_idx` | UNIQUE | `item_id` | `is_current` |
| `item_audio_item_idx` | 일반 | `item_id` | — |

### `item_visual_assets`

| 인덱스 이름 | 구분 | 키 (정의 순서) | 부분 인덱스 조건 (`WHERE`) |
| --- | --- | --- | --- |
| `item_visual_assets_pkey` | PK | `visual_asset_id` | — |
| `item_visual_current_hash_idx` | UNIQUE | `item_id, content_hash, visual_role, option_number` | `is_current` |

### `items`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `items_pkey` | PK | `item_id` |
| `items_exam_lookup_idx` | 일반 | `exam_format, section, item_type, target_level, review_status` |
| `items_lookup_idx` | 일반 | `section, item_type, target_level, review_status` |
| `items_set_id_position_key` | UNIQUE | `set_id, "position"` |
| `items_slot_idx` | 일반 | `section, generator_version, type_slot` |
| `items_source_key_key` | UNIQUE | `source_key` |

### `question_sets`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `question_sets_pkey` | PK | `set_id` |
| `question_sets_exam_id_key` | UNIQUE | `set_id, exam_format` |
| `question_sets_exam_sequence_key` | UNIQUE | `exam_format, section, generator_provider, generator_model, generator_version, set_sequence` |

### `tts_audio_assets`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `tts_audio_assets_pkey` | PK | `audio_asset_id` |
| `tts_audio_assets_source_hash_model_name_female_voice_male_v_key` | UNIQUE | `source_hash, model_name, female_voice, male_voice` |

### `vocabulary`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `vocabulary_pkey` | PK | `vocabulary_id` |
| `vocabulary_korean_part_of_speech_key` | UNIQUE | `korean, part_of_speech` |

### `vocabulary_questions`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `vocabulary_questions_pkey` | PK | `question_id` |
| `vocabulary_questions_vocabulary_id_position_key` | UNIQUE | `vocabulary_id, "position"` |

### `writing_questions`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `writing_questions_pkey` | PK | `set_id, type_slot` |

### `writing_sets`

| 인덱스 이름 | 구분 | 키 (정의 순서) |
| --- | --- | --- |
| `writing_sets_pkey` | PK | `set_id` |
| `writing_sets_source_key_key` | UNIQUE | `source_key` |

조회에는 PostgreSQL 시스템 카탈로그 `pg_index`, `pg_class`, `pg_namespace`, `pg_am`을 사용했다. 인덱스 키와 부분 조건은 `pg_get_indexdef`와 `pg_get_expr`의 결과를 기준으로 기록했다.
