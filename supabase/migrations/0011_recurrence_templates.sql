-- ============================================================
-- 0011_recurrence_templates.sql — 학생별 반복 일정 템플릿 (A1)
--
-- 선생님이 학생별 고정 수업(요일·시작시각·길이)을 템플릿으로 저장하고,
-- 캘린더 '수업 추가' 시 적용해 빠르게 일정을 채운다.
-- weekday: 0=일 … 6=토 (JS Date.getDay 기준)
-- start_minute: 자정부터 분(0~1439, 30분 단위)
-- duration: 분(60~360, 30분 단위) — schedules 와 동일 규칙
-- ============================================================

create table if not exists public.recurrence_templates (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  weekday       int not null check (weekday between 0 and 6),
  start_minute  int not null check (start_minute between 0 and 1439 and start_minute % 30 = 0),
  duration      int not null check (duration between 60 and 360 and duration % 30 = 0),
  created_at    timestamptz not null default now()
);
create index if not exists recurrence_templates_student_idx
  on public.recurrence_templates(student_id);

alter table public.recurrence_templates enable row level security;

-- 선생님만 관리 (학부모 노출 불필요)
drop policy if exists rtpl_all on public.recurrence_templates;
create policy rtpl_all on public.recurrence_templates
  for all using (public.is_teacher()) with check (public.is_teacher());
