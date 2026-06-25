-- ============================================================
-- 0001_schema.sql  —  TutorHub v1 스키마
-- 테이블: profiles, students, schedules, requests, settings, audit_log
-- 시간은 모두 timestamptz(UTC) 저장, 표시는 앱에서 Asia/Seoul.
-- ============================================================

create extension if not exists btree_gist;

-- ── profiles : auth.users 1:1, 역할 보유 ─────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'parent' check (role in ('teacher', 'parent')),
  display_name text,
  created_at   timestamptz not null default now()
);

-- ── students : 학생 + (로그인하는) 학부모 연결, 과외 조건 ────
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  parent_id       uuid references public.profiles (id) on delete set null,
  color           text not null default '#3b82f6',
  active          boolean not null default true,
  -- v2 정산용 컬럼 (v1 에서는 미사용, nullable)
  hourly_rate     integer,
  lesson_duration numeric(3, 1),
  monthly_count   integer,
  created_at      timestamptz not null default now()
);
create index if not exists students_parent_id_idx on public.students (parent_id);

-- ── schedules : 확정/취소 일정 ───────────────────────────────
create table if not exists public.schedules (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  source     text not null default 'regular'   check (source in ('regular', 'makeup', 'added')),
  note       text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- 선생님 1명은 동시 수업 불가: 확정 일정 간 시간 겹침 차단.
  -- tstzrange 기본 '[)' 이므로 10:00-11:00 / 11:00-12:00 인접은 허용.
  constraint schedules_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at) with &&)
    where (status = 'confirmed')
);
create index if not exists schedules_student_starts_idx
  on public.schedules (student_id, starts_at);

-- ── requests : 학부모의 추가/변경/취소 요청 (승인 워크플로우) ─
create table if not exists public.requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  schedule_id     uuid references public.schedules (id) on delete cascade, -- add 면 null
  type            text not null check (type in ('add', 'change', 'cancel')),
  proposed_starts timestamptz,
  proposed_ends   timestamptz,
  note            text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason   text,
  requested_by    uuid references public.profiles (id) on delete set null,
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  -- add/change 요청은 제안 시간 필요
  check (type = 'cancel' or (proposed_starts is not null and proposed_ends is not null)),
  -- change/cancel 요청은 대상 일정 필요
  check (type = 'add' or schedule_id is not null)
);
create index if not exists requests_status_idx     on public.requests (status);
create index if not exists requests_student_id_idx on public.requests (student_id);

-- ── settings : 단일 행(선생님 전역 설정) ─────────────────────
create table if not exists public.settings (
  id               integer primary key default 1 check (id = 1),
  bank_account     text,
  telegram_chat_id text
);

-- ── audit_log : 변경 이력 (정산 분쟁 대비) ───────────────────
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- ── updated_at 자동 갱신 트리거 ──────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists schedules_touch_updated_at on public.schedules;
create trigger schedules_touch_updated_at
  before update on public.schedules
  for each row execute function public.touch_updated_at();

-- ── Realtime : 변경 사항 실시간 구독 대상 등록 (재실행 안전) ──
do $$
begin
  alter publication supabase_realtime add table public.schedules;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.requests;
exception when duplicate_object then null;
end $$;
