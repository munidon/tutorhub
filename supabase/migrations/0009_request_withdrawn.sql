-- ============================================================
-- 0009_request_withdrawn.sql — 요청 철회를 '상태'로 (하드 삭제 제거)
--
-- 요청 생명주기: pending → approved | rejected | withdrawn
-- 모든 종료 전이는 status='pending' 가드 + 원자적. first-writer-wins.
-- 기존에 학부모 '요청 취소'는 행을 하드 삭제했는데, 선생님 결정과 경합하면
-- 데이터 손실/불일치가 발생(취소 승인 후 철회 시 수업은 취소된 채 기록만 사라짐).
-- → 철회를 withdrawn 상태 전이로 바꿔 추적성 유지 + 경합 안전.
-- ============================================================

-- 1) status 에 'withdrawn' 추가
alter table public.requests drop constraint if exists requests_status_check;
alter table public.requests
  add constraint requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));

-- 2) 학부모의 하드 삭제 경로 제거 — DELETE 는 선생님만 (철회는 UPDATE 로)
drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests
  for delete using (public.is_teacher());

-- 3) 학부모 철회: 본인 'pending' 요청을 'withdrawn' 으로만 전이 가능.
--    using 으로 대상 행(본인 + 대기중)을, with check 로 결과 상태(withdrawn)를 제한
--    → 학부모가 승인/반려로 위조 불가. 선생님 update 정책(requests_update)과 OR 결합.
drop policy if exists requests_update_withdraw on public.requests;
create policy requests_update_withdraw on public.requests
  for update
  using (requested_by = auth.uid() and status = 'pending')
  with check (requested_by = auth.uid() and status = 'withdrawn');
