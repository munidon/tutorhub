-- ============================================================
-- 0008_requests_delete_policy.sql — 요청 삭제 정책
-- 학부모는 본인이 보낸 요청만 삭제 가능, 선생님은 전체 삭제 가능.
-- ============================================================

drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests
  for delete using (public.is_teacher() or requested_by = auth.uid());
