-- ============================================================
-- 0004_remove_source.sql — 정규/보강(source) 개념 제거
-- 모든 일정을 '수업'으로 통칭. source 컬럼/제약 삭제 + RPC 갱신.
-- ============================================================

alter table public.schedules drop column if exists source;

-- decide_request 재정의: 'add' 승인 시 source 없이 insert
create or replace function public.decide_request(
  p_request_id uuid,
  p_decision   text,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests;
begin
  if not public.is_teacher() then
    raise exception 'only teacher can decide requests';
  end if;

  select * into r from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request % not found', p_request_id;
  end if;
  if r.status <> 'pending' then
    raise exception 'request % already decided (%)', p_request_id, r.status;
  end if;

  if p_decision = 'approved' then
    if r.type = 'add' then
      insert into public.schedules (student_id, starts_at, ends_at, status, created_by)
      values (r.student_id, r.proposed_starts, r.proposed_ends, 'confirmed', auth.uid());
    elsif r.type = 'change' then
      update public.schedules
        set starts_at = r.proposed_starts, ends_at = r.proposed_ends
        where id = r.schedule_id;
    elsif r.type = 'cancel' then
      update public.schedules
        set status = 'cancelled'
        where id = r.schedule_id;
    end if;

    update public.requests
      set status = 'approved', decided_by = auth.uid(), decided_at = now()
      where id = p_request_id;

  elsif p_decision = 'rejected' then
    update public.requests
      set status = 'rejected', reject_reason = p_reason,
          decided_by = auth.uid(), decided_at = now()
      where id = p_request_id;

  else
    raise exception 'invalid decision: %', p_decision;
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, payload)
  values (
    auth.uid(),
    'decide_request:' || p_decision,
    'requests',
    p_request_id,
    jsonb_build_object('type', r.type, 'student_id', r.student_id, 'reason', p_reason)
  );
end;
$$;
