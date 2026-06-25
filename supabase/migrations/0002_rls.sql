-- ============================================================
-- 0002_rls.sql  —  Row Level Security 정책
-- 핵심: parent 는 본인 자녀 데이터만, teacher 는 전체.
-- ============================================================

-- ── 헬퍼: 현재 사용자가 teacher 인가 ─────────────────────────
-- security definer 로 profiles 를 RLS 우회 조회 → 정책 내 재귀 방지.
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

-- ── 헬퍼: 해당 student 가 현재 학부모의 자녀인가 ─────────────
create or replace function public.owns_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students
    where id = p_student_id and parent_id = auth.uid()
  );
$$;

-- ── RLS 활성화 ───────────────────────────────────────────────
alter table public.profiles  enable row level security;
alter table public.students  enable row level security;
alter table public.schedules enable row level security;
alter table public.requests  enable row level security;
alter table public.settings  enable row level security;
alter table public.audit_log enable row level security;

-- ── profiles ────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_teacher());

-- ── students ────────────────────────────────────────────────
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select using (public.is_teacher() or parent_id = auth.uid());

drop policy if exists students_write on public.students;
create policy students_write on public.students
  for all using (public.is_teacher()) with check (public.is_teacher());

-- ── schedules ───────────────────────────────────────────────
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules
  for select using (public.is_teacher() or public.owns_student(student_id));

drop policy if exists schedules_write on public.schedules;
create policy schedules_write on public.schedules
  for all using (public.is_teacher()) with check (public.is_teacher());

-- ── requests ────────────────────────────────────────────────
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select using (public.is_teacher() or public.owns_student(student_id));

-- 학부모는 본인 자녀에 대해 본인 명의로만 요청 생성 가능. 선생님도 생성 가능.
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests
  for insert with check (
    public.is_teacher()
    or (public.owns_student(student_id) and requested_by = auth.uid())
  );

-- 직접 update 는 teacher 만. (승인/반려는 decide_request RPC 사용 권장)
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests
  for update using (public.is_teacher()) with check (public.is_teacher());

-- ── settings : 선생님만 조회/수정 (telegram_chat_id 등 민감) ──
drop policy if exists settings_all on public.settings;
create policy settings_all on public.settings
  for all using (public.is_teacher()) with check (public.is_teacher());

-- ── audit_log : 선생님만 조회. insert 는 security definer 함수로만. ─
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (public.is_teacher());
