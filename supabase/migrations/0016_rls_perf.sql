-- ============================================================
-- 0016_rls_perf.sql — RLS 성능 최적화 + 인덱스
--
-- 1) 정책의 함수 호출을 (select ...) 로 감싸 InitPlan 으로 승격
--    → 행마다 평가되던 is_teacher()/auth.uid() 가 쿼리당 1회로.
-- 2) owns_student(student_id) 는 행별 인자 때문에 승격이 불가능
--    (행마다 students EXISTS 서브쿼리 실행) →
--    소유 학생 id 집합을 반환하는 owned_student_ids() 로 교체,
--    student_id in (select ...) 형태로 쿼리당 1회만 평가.
-- 접근 범위는 기존과 완전히 동일하다 (성능만 개선).
-- ============================================================

-- ── 헬퍼: 현재 학부모가 소유한 학생 id 집합 ──────────────────
-- security definer 로 students RLS 우회 → 정책 내 중첩 평가 방지.
create or replace function public.owned_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.students where parent_id = auth.uid();
$$;

-- ── profiles ────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = (select auth.uid()) or (select public.is_teacher()));

-- ── students ────────────────────────────────────────────────
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select using (
    (select public.is_teacher()) or parent_id = (select auth.uid())
  );

drop policy if exists students_write on public.students;
create policy students_write on public.students
  for all using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

-- ── schedules ───────────────────────────────────────────────
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules
  for select using (
    (select public.is_teacher())
    or student_id in (select public.owned_student_ids())
  );

drop policy if exists schedules_write on public.schedules;
create policy schedules_write on public.schedules
  for all using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

-- ── requests ────────────────────────────────────────────────
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select using (
    (select public.is_teacher())
    or student_id in (select public.owned_student_ids())
  );

drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests
  for insert with check (
    (select public.is_teacher())
    or (
      student_id in (select public.owned_student_ids())
      and requested_by = (select auth.uid())
    )
  );

drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests
  for update using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests
  for delete using ((select public.is_teacher()));

drop policy if exists requests_update_withdraw on public.requests;
create policy requests_update_withdraw on public.requests
  for update
  using (requested_by = (select auth.uid()) and status = 'pending')
  with check (requested_by = (select auth.uid()) and status = 'withdrawn');

-- ── settings ────────────────────────────────────────────────
drop policy if exists settings_all on public.settings;
create policy settings_all on public.settings
  for all using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

-- ── audit_log ───────────────────────────────────────────────
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using ((select public.is_teacher()));

-- ── payments ────────────────────────────────────────────────
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    (select public.is_teacher())
    or student_id in (select public.owned_student_ids())
  );

drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments
  for all using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

-- ── recurrence_templates ────────────────────────────────────
drop policy if exists rtpl_all on public.recurrence_templates;
create policy rtpl_all on public.recurrence_templates
  for all using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

-- ── 인덱스 ──────────────────────────────────────────────────
-- 캘린더의 starts_at 범위 조회용 (기존 인덱스는 student_id 선두라 부적합)
create index if not exists schedules_starts_at_idx
  on public.schedules (starts_at);
-- 요청 내역의 created_at 범위 조회·정렬용
create index if not exists requests_created_at_idx
  on public.requests (created_at desc);
