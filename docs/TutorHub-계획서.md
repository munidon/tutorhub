# TutorHub 계획서 — 과외 일정 및 스마트 조율 웹 서비스

> 본 문서는 기존 기획서를 **착수 가능한 수준으로 보완·구체화한 계획서**입니다.
> 확정 결정: **Next.js(App Router) + Supabase + Vercel** · 알림은 **Telegram 봇** ·
> **v1 범위는 일정 조율(정산은 v2)**.

---

## 1. 프로젝트 개요

- **제품명(가칭)**: TutorHub
- **한 줄 정의**: 과외 선생님이 고정 스케줄을 캘린더에 등록하고, 학부모는 발급받은 계정으로
  로그인해 자녀 일정을 확인·변경 요청하며, 선생님이 승인/반려하는 "단일 진실 공급원(Single
  Source of Truth)" 일정 조율 서비스.
- **배경/문제**: 매달 말 문자 메시지로 일정 조율·보강·변경 내역을 관리하면서 시간·감정 소모가 큼.
  현재 학생 3명 → 가벼운 단일 선생님(solo) 운영 규모.
- **핵심 가치**
  - **시각화**: 캘린더 UI로 일정·시간대를 직관적으로 확인
  - **보안성**: 일반 회원가입 배제, 선생님이 계정 직접 발급, 학생 간 데이터 철저 격리(RLS)
  - **상호작용**: 학부모 요청 → 선생님 알림(Telegram) → 승인 → 캘린더 실시간 반영

### 1.1 범위(Scope) — 단계별

| 단계 | 포함 기능 | 예상 기간 |
|------|-----------|-----------|
| **v1 (MVP)** | 계정 발급·로그인, 선생님 캘린더 CRUD, 학부모 캘린더 조회(격리), 변경/추가/취소 요청, 승인/반려(사유), 상태 시각화, 실시간 반영, Telegram 알림, 배포 | ~3주 |
| **v2** | 학생별 과외 조건(시급·회당 시간·월 기본 횟수), 반복 일정 템플릿, 다음 달 스케줄 자동 가등록, 선불 수업료 자동 산정, 학부모 청구서 뷰, 입금 체크 | ~2주 |
| **v3** | 월별 리포트/통계, 푸시(PWA), 다중 선생님, (선택) 카카오 알림톡 | 추후 |

### 1.2 비범위(Out of scope, v1)
- 온라인 결제(PG) 연동 — 입금은 계좌이체 안내 + 선생님 수동 확인
- 자동 보강 추천 / 충돌 자동 해결 — 충돌은 선생님이 수동 판단
- 다국어 — 한국어 단일

---

## 2. 사용자 & 역할

| 역할 | 인원 | 권한 |
|------|------|------|
| 선생님(teacher, admin) | 1 | 모든 학생/일정/요청 조회·생성·수정, 계정 발급, 승인/반려 |
| 학부모(parent) | N | 본인 자녀 일정만 조회, 변경/추가/취소 요청, 요청 상태 확인 |

- **부모-자녀 관계는 1:N 지원**(한 학부모가 형제 2명을 둘 수 있음). 로그인 1계정에 여러 학생 연결 가능.
- 한 학생은 여러 시간대(주 2회 등)를 가질 수 있음.

---

## 3. 사용자 시나리오 (User Journey)

### 3.1 선생님
1. **계정 발급**: `/admin/students`에서 학생 추가 → 학부모 로그인 ID·초기 비밀번호 생성 →
   학생별 색상 지정. (생성된 ID/PW를 선생님이 학부모에게 직접 전달)
2. **기본 스케줄 등록**: `/admin/calendar`에서 고정 수업을 클릭/드래그로 등록(확정 상태).
3. **요청 관리**: 학부모 요청 발생 시 Telegram 알림 수신 → 링크로 `/admin/requests` 진입 →
   "승인" 또는 "반려(사유 작성)". 승인 시 캘린더에 즉시 반영.
4. **(v2) 정산**: 다음 달 가등록 스케줄 기반 예상 수업료 자동 산정 → 교재비/이월 가감 → 확정.

### 3.2 학부모
1. **로그인**: 전달받은 ID/PW로 로그인(자녀 일정만 노출).
2. **일정 확인**: `/calendar`에서 이번 달 자녀 스케줄을 색상·상태로 확인.
3. **조율 요청**
   - 변경: 기존 수업 클릭 → 원하는 날짜/시간으로 변경 요청
   - 추가: 빈 시간대 클릭 → 보강 등 추가 수업 요청
   - 취소: 기존 수업 클릭 → 취소 요청
4. **상태 확인**: 캘린더와 `/requests`에서 대기 중 / 승인됨 / 반려됨(+사유)을 시각적으로 확인.

---

## 4. 기능 명세 (Functional Requirements)

### 4.1 계정 관리 & 접근 제어 (v1)
- **폐쇄형 계정**: 공개 회원가입 없음. 선생님만 `/admin/students`에서 학부모 계정 발급.
- **인증**: Supabase Auth(email/password) 사용. 학부모는 이메일이 없을 수 있으므로
  **합성 이메일** `{parent_id}@parents.tutorhub.local`로 매핑(이메일 확인 절차 비활성화).
  비밀번호는 **Supabase가 해시/관리** — 애플리케이션 DB에 평문/자체암호화 저장 금지(원본 기획서 보완).
- **데이터 격리(Multi-tenancy)**: Postgres **Row Level Security(RLS)**로 강제. 학부모는
  `auth.uid()`와 연결된 자녀의 행만 SELECT 가능. 타 학생 데이터는 쿼리 자체가 불가.
- **역할 구분**: `profiles.role ∈ {teacher, parent}`. 선생님 계정은 초기 1개(시드).

### 4.2 캘린더 / 스케줄러 (v1)
- **선생님 뷰**: 전 학생 일정이 **색상별**로 통합 표시(시간대 중복 방지).
  생성/수정/삭제(드래그·리사이즈) 지원.
- **학부모 뷰**: 본인 자녀 일정만 표시. 일정 클릭으로 변경/취소 요청, 빈 슬롯 클릭으로 추가 요청.
- **일정 상태(status) 시각화**
  - `confirmed`(확정): 진한 단색
  - `pending`(요청 대기): 점선 테두리 + 반투명(요청 테이블 기반 오버레이)
  - `rejected`(반려): 흐림/빨간 표시 + 반려 사유 노출
  - `cancelled`(취소/반려된 일정): 회색 취소선
- **중복 예약 방지**: 선생님 1명이 동시 수업 불가 → 확정 일정 간 시간 겹침을 DB
  `EXCLUDE` 제약으로 차단(아래 5.4).

### 4.3 요청/승인 워크플로우 (v1)
- 요청은 **별도 `requests` 테이블**로 모델링(일정 status에 다 욱여넣지 않음 — 원본 보완).
  요청 타입: `add`(추가) / `change`(변경) / `cancel`(취소).
- **상태 머신**: `pending → approved | rejected`.
- **승인 처리(원자적)**: Postgres 함수(RPC) `decide_request(request_id, decision, reason)`로
  트랜잭션 처리.
  - `add` 승인 → `schedules`에 confirmed 일정 INSERT
  - `change` 승인 → 대상 일정의 시간 UPDATE
  - `cancel` 승인 → 대상 일정 status=cancelled
  - 공통 → `requests.status` 갱신, `decided_at`/`decided_by` 기록, 감사 로그 적재
- **실시간 반영**: Supabase Realtime 구독으로 학부모/선생님 화면이 새로고침 없이 갱신.

### 4.4 알림 (Telegram, v1)
- **트리거**: `requests` INSERT 시 **Supabase Database Webhook → Edge Function
  `notify-telegram`** → Telegram `sendMessage`.
  (앱 서버 액션에서 직접 호출하는 방식보다 DB 이벤트 기반이 누락에 강함 — 권장)
- **메시지 예시**: `📌 [학생A] 학부모 변경 요청: 6/28(토) 14:00→16:00. 승인하기 ▶ <딥링크>`
- **딥링크**: `/admin/requests/{id}`(로그인 필요). *원탭 승인 토큰 링크는 v3 보안 검토 후.*
- **설정**: BotFather로 봇 토큰 발급 → 선생님이 봇에게 1회 메시지 → `getUpdates`로 `chat_id`
  확보 → `settings`에 저장. 비용 무료.

### 4.5 (v2) 학생별 과외 조건 & 선불 정산
- 학생별 설정: 시급(hourly_rate), 회당 시간(lesson_duration, 예 1.5/2.0), 월 기본 횟수.
- 자동 산정: `회당 수업료 = 시급 × 회당 시간`, `다음 달 청구액 = 회당 수업료 × 다음 달 가등록 횟수`.
  - 예: 시급 40,000 × 2시간 × 9회 = **720,000원**.
- 추가 항목: 교재비/기타 가감, **지난달 이월(취소·환불 크레딧)** 반영.
- 학부모 청구서 뷰: 다음 달 예정 횟수·날짜 리스트, 회당/총 금액, 선생님 계좌 + **복사 버튼**, 입금 안내.
- 선생님: 입금 완료 체크(`is_paid`).

---

## 5. 아키텍처 & 기술 스택 (확정)

### 5.1 스택
| 레이어 | 선택 | 비고 |
|--------|------|------|
| Frontend/SSR | **Next.js (App Router) + TypeScript** | Vercel 배포, 모바일 우선 |
| UI | **Tailwind CSS + shadcn/ui** | 빠른 컴포넌트 |
| 캘린더 | **FullCalendar (@fullcalendar/react)** | dayGrid/timeGrid, 드래그·리사이즈 |
| 인증/DB | **Supabase (Auth + Postgres + RLS + Realtime)** | 데이터 격리 핵심 |
| 서버리스 | **Supabase Edge Functions** | Telegram 알림 |
| 알림 | **Telegram Bot API** | 무료, 즉시 푸시 |
| 배포 | **Vercel(Hobby) + Supabase(Free)** | 학생 3명 규모 무료 한도 내 |

### 5.2 화면 구성 (모바일 우선)
- **공개**: `/login` (단일 로그인 폼, 인증 후 role로 분기)
- **선생님**: `/admin`(대시보드: 대기 요청 수·오늘 일정), `/admin/calendar`, `/admin/requests`,
  `/admin/students`(계정 발급·색상), `/admin/settings`(계좌·Telegram chat_id)
- **학부모**: `/calendar`(자녀 일정+요청 오버레이), `/requests`(상태 리스트), (v2) `/billing`

### 5.3 데이터 모델 (Supabase / Postgres) — v1 핵심

> 원본의 단일 `students` 테이블(로그인 정보+학생정보+조건 혼재, 비밀번호 컬럼)을 **책임 분리**하고
> 비밀번호는 Auth로 위임. 요청은 별도 테이블로 분리.

```text
profiles
  id            uuid PK  (= auth.users.id)
  role          text     -- 'teacher' | 'parent'
  display_name  text
  created_at    timestamptz default now()

students
  id            uuid PK default gen_random_uuid()
  name          text not null
  parent_id     uuid FK -> profiles.id           -- 로그인하는 학부모
  color         text    -- 캘린더 색(hex)
  active        boolean default true
  -- v2 컬럼: hourly_rate int, lesson_duration numeric, monthly_count int
  created_at    timestamptz default now()

schedules
  id            uuid PK default gen_random_uuid()
  student_id    uuid FK -> students.id
  starts_at     timestamptz not null
  ends_at       timestamptz not null
  status        text default 'confirmed'  -- 'confirmed' | 'cancelled'
  source        text default 'regular'    -- 'regular' | 'makeup' | 'added'
  note          text
  created_by    uuid FK -> profiles.id
  created_at    timestamptz default now()
  updated_at    timestamptz default now()

requests
  id               uuid PK default gen_random_uuid()
  student_id       uuid FK -> students.id
  schedule_id      uuid FK -> schedules.id   -- change/cancel 대상(add면 null)
  type             text not null             -- 'add' | 'change' | 'cancel'
  proposed_starts  timestamptz               -- add/change용
  proposed_ends    timestamptz
  note             text
  status           text default 'pending'    -- 'pending' | 'approved' | 'rejected'
  reject_reason    text
  requested_by     uuid FK -> profiles.id
  decided_by       uuid FK -> profiles.id
  decided_at       timestamptz
  created_at       timestamptz default now()

settings            -- 단일 행(선생님)
  id            int PK default 1
  bank_account  text
  telegram_chat_id text

audit_log           -- 정산/분쟁 대비 변경 이력
  id    bigint PK
  actor uuid, action text, entity text, entity_id uuid, payload jsonb,
  created_at timestamptz default now()
```
v2 추가: `billing(id, student_id, target_month, expected_count, base_amount, extra_fee,
carryover, total_amount, is_paid, paid_at)`, `recurrence_templates(요일/시간/회당시간)`.

### 5.4 보안·무결성 핵심 포인트
- **RLS 정책(개요)**
  - `students`/`schedules`/`requests` SELECT: `teacher`는 전체, `parent`는 자기 자녀 행만.
  - INSERT/UPDATE: 일정 생성·승인은 teacher만; `requests` INSERT는 해당 자녀의 parent 허용.
- **중복 예약 차단**:
  `EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&) WHERE (status='confirmed')`
  (btree_gist 확장). 선생님 동시 수업 방지.
- **시간대**: 저장은 `timestamptz`(UTC), 표시·입력은 **Asia/Seoul** 고정.
- **승인 원자성**: `decide_request` RPC를 `security definer`로 트랜잭션 처리.
- **최소 개인정보**: 학생 이름만 저장, 비밀번호는 Supabase 해시, 전 구간 HTTPS.

### 5.5 알림 파이프라인
```
parent → [requests INSERT] → Supabase DB Webhook → Edge Function(notify-telegram)
        → Telegram sendMessage(text + 딥링크) → 선생님 모바일 푸시
선생님 → /admin/requests → decide_request RPC → schedules 갱신
        → Supabase Realtime → 학부모/선생님 화면 즉시 반영
```

---

## 6. 비기능 요구사항 (NFR)
- **반응형/PWA**: 모바일 우선, manifest로 홈 화면 추가 가능(푸시는 v3).
- **동시성**: 일정 수정 시 `updated_at` 낙관적 동시성 + EXCLUDE 제약.
- **감사성**: 일정/요청 변경 `audit_log` 적재(정산 분쟁 대비, v2 정산의 신뢰 기반).
- **가용성/비용**: Vercel Hobby·Supabase Free 한도 내(DB 500MB, MAU 5만 — 3명 규모 충분).
  Edge Function 콜드스타트 수초 가능 → 알림 지연 허용.
- **백업**: Supabase 자동 백업 의존(무료 티어 보존기간 한계 인지) + 월 1회 수동 export 권장.
- **접근성/언어**: 한국어 UI, 큰 터치 타깃.
- **남용 방지**: 요청 생성에 간단한 rate limit(분당 N건).

---

## 7. 로드맵 & 일정 (v1, ~3주)

| 주차 | 목표 | 산출물 / 수용 기준 |
|------|------|--------------------|
| **W0 (셋업)** | 저장소·인프라 | Next.js+TS, Tailwind/shadcn, Supabase 프로젝트, 스키마+RLS 마이그레이션, 로그인 동작 |
| **W1 (캘린더·계정)** | 핵심 데이터 | 선생님 캘린더 CRUD, 학생/계정 발급, 학부모 캘린더 조회, **격리 검증(타 학생 조회 차단)** |
| **W2 (워크플로우·알림·배포)** | 조율 완성 | 추가/변경/취소 요청, 승인/반려(사유), 상태 시각화, Realtime, **Telegram 알림**, Vercel 배포 |

- **v2(~2주)**: 반복 템플릿·다음 달 가등록 자동화·정산 엔진·청구서 뷰·입금 체크.
- **v3**: 리포트/통계·PWA 푸시·다중 선생님·(선택)카카오 알림톡.

---

## 8. 원본 기획서 대비 주요 보완점 (요약)
1. **스택 확정**: Streamlit/Next.js·Supabase/Firebase·n8n/Make 양자택일 → Next.js+Supabase+
   Telegram(Edge Function)로 단순·견고하게 확정. 인프라 구성요소 최소화.
2. **보안**: `students.password` 평문/자체암호화 컬럼 제거 → Supabase Auth 위임 + 합성 이메일.
3. **데이터 모델 정규화**: 로그인/학생/조건 혼재 분리, **요청을 별도 테이블**로, 부모-자녀 1:N 지원.
4. **워크플로우 명확화**: 상태 머신 + 원자적 승인 RPC + 감사 로그.
5. **무결성**: 중복 예약 `EXCLUDE` 제약, timestamptz/Asia-Seoul 시간대 규칙.
6. **범위 페이징**: v1=일정 조율, v2=선불 정산으로 분리해 빠른 출시 + 리스크 축소.

---

## 9. 리스크 & 대응
- **Supabase Auth 이메일 필수** → 합성 이메일 매핑으로 해결(문서화).
- **Telegram `chat_id` 확보 절차 친화도 낮음** → 설정 가이드 + 1회성 헬퍼 스크립트.
- **무료 티어 한도/콜드스타트** → 규모상 무관, 알림 지연 허용으로 설계.
- **정산 분쟁(v2)** → v1부터 감사 로그를 쌓아 근거 확보.

---

## 10. 열린 가정 (추후 확인용, 차단 아님)
- 선생님 계정은 1개(solo). 다중 선생님은 v3.
- 청구는 계좌이체 안내까지(자동 결제 미포함).
- 보강/추가는 선생님 수동 승인(자동 충돌 해결 없음).

---

## 부록 A. v1 구현 체크리스트 (착수용)
- [ ] Supabase 프로젝트 생성, `btree_gist` 확장 활성화
- [ ] 스키마 마이그레이션(`profiles`/`students`/`schedules`/`requests`/`settings`/`audit_log`)
- [ ] RLS 정책 + `decide_request` RPC(security definer) 작성
- [ ] Next.js(App Router) + Tailwind/shadcn 스캐폴딩, Supabase 클라이언트 연동
- [ ] 로그인(`/login`) + role 분기 미들웨어
- [ ] 선생님 계정 발급(Admin API, 합성 이메일) `/admin/students`
- [ ] 선생님 캘린더 CRUD `/admin/calendar` (FullCalendar)
- [ ] 학부모 캘린더 조회 + 요청 생성 `/calendar`, 상태 리스트 `/requests`
- [ ] 승인/반려 `/admin/requests` + Realtime 구독
- [ ] Telegram 봇 설정 + DB Webhook + Edge Function `notify-telegram`
- [ ] **격리 테스트**: 학부모 A로 학생 B 데이터 조회 차단 확인
- [ ] Vercel 배포 + 환경변수 설정
