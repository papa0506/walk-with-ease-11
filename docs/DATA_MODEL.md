# 데이터 모델 계획 (1단계: 설계만)

본 문서는 Lovable 클라우드(Supabase) 연결 이후 단계에서 만들 테이블/정책의 **계획**입니다.
이 단계에서는 실제 마이그레이션을 적용하지 않습니다.

## 보안 원칙

- 위치 공유 기본값은 **PRIVATE** (`location_share_default = 'private'`).
- 승인되지 않은 사용자(`approval_status != 'approved'`)는 산책 시작, 위치 공유,
  친구 찾기, 원터치 복지콜 기능 사용 불가 — RLS 정책으로 강제.
- 미검증 남산 안전 데이터(`hazards.verified = false`)는 실시간 안내에 사용되지 않음.
- 역할은 별도 `user_roles` 테이블에 저장 (profile에 저장 금지).
- 모든 `public.*` 테이블에 RLS + GRANT 동시 적용.

## 테이블 (계획)

### profiles
사용자 표시 정보. `auth.users.id` 참조.
- `id uuid PK references auth.users`
- `display_name text`
- `phone text` (긴급 연락 — 본인/관리자만 read)
- `approval_status enum('pending','approved','rejected') default 'pending'`
- `location_share_default enum('private','friends','public') default 'private'`
- `created_at timestamptz`

### user_roles
- `user_id uuid`, `role enum('user','admin')`
- `has_role(uid, role)` SECURITY DEFINER 함수로 RLS에서 사용.

### friendships
양방향 동의 친구 관계.
- `user_a`, `user_b`, `status enum('pending','accepted','blocked')`
- 위치 공유는 `accepted` AND 양쪽 `location_share_default != 'private'` 일 때만.

### walks
- `id`, `user_id`, `route_id nullable`, `started_at`, `ended_at`,
  `voice_guidance bool`, `hazard_warning bool`, `status enum('active','done','aborted')`

### walk_points (선택)
산책 경로 점. 본인만 read; 마이그레이션 시점에 PII 보관 정책 재검토.

### routes
- `id`, `name`, `length_m`, `verified bool`, `created_by`

### hazards
- `id`, `lat`, `lng`, `kind enum('stairs','road','construction',...)`,
  `verified bool`, `verified_by`, `verified_at`
- **`verified = false` 데이터는 클라이언트 안내 쿼리에서 제외.**

### welfare_call_requests (시안 단계는 미생성)
- 실제 외부 연동은 별도 단계.

## RLS 정책 요약 (계획)

- `profiles`: 본인만 select/update; admin은 전체 select/update.
- `walks`, `walk_points`: 본인만 + admin.
- `hazards`: 모든 인증 사용자 select WHERE `verified = true`; admin은 전체.
- `friendships`: 양쪽 사용자 + admin만.
- 모든 테이블에 `approval_status = 'approved'` 게이트:
  ```sql
  using ( exists (
    select 1 from profiles
     where id = auth.uid() and approval_status = 'approved'
  ))
  ```

## 1단계에서 만들지 않는 것

- 실제 GPS routeMeter 보정
- 실제 친구 위치 공유
- 실제 원터치복지콜 외부 연동
- 실제 LLM API 호출
- 전체 admin 워크플로 완성
- production 배포
