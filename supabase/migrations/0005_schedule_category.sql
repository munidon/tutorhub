-- ============================================================
-- 0005_schedule_category.sql — 수업 구분(정규/추가/변경/취소)
-- category: regular(정규) | added(추가) | changed(변경) | cancelled(취소)
-- prev_starts/prev_ends: 변경 전 시간(변경 delta·이력 표시용)
-- ============================================================

alter table public.schedules
  add column if not exists category text not null default 'regular'
    check (category in ('regular', 'added', 'changed', 'cancelled'));

alter table public.schedules add column if not exists prev_starts timestamptz;
alter table public.schedules add column if not exists prev_ends   timestamptz;

-- 기존 취소된 일정은 구분도 '취소'로 정렬
update public.schedules set category = 'cancelled' where status = 'cancelled';

-- decide_request 재정의: 승인 시 구분/이전시간 반영
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
      insert into public.schedules (student_id, starts_at, ends_at, status, category, created_by)
      values (r.student_id, r.proposed_starts, r.proposed_ends, 'confirmed', 'added', auth.uid());
    elsif r.type = 'change' then
      update public.schedules
        set prev_starts = starts_at, prev_ends = ends_at,
            starts_at = r.proposed_starts, ends_at = r.proposed_ends,
            category = 'changed'
        where id = r.schedule_id;
    elsif r.type = 'cancel' then
      update public.schedules
        set status = 'cancelled', category = 'cancelled'
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
