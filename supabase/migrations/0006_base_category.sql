-- ============================================================
-- 0006_base_category.sql — 수업의 '원본 구분' 보존
-- base_category: regular(정규로 계획) | added(추가로 생성) — 생성 시 고정, 변경/취소돼도 불변.
-- 정산에서 정규시간은 base_category='regular' 기준(당초 계획)으로 계산한다.
-- ============================================================

alter table public.schedules
  add column if not exists base_category text not null default 'regular'
    check (base_category in ('regular', 'added'));

-- 기존 데이터 backfill: 현재 category 가 'added' 면 원본도 추가, 그 외(정규/변경/취소)는 정규로 간주
update public.schedules set base_category = 'added' where category = 'added';

-- decide_request 재정의: 'add' 승인 시 base_category 도 'added'
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
      insert into public.schedules
        (student_id, starts_at, ends_at, status, category, base_category, created_by)
      values
        (r.student_id, r.proposed_starts, r.proposed_ends, 'confirmed', 'added', 'added', auth.uid());
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
