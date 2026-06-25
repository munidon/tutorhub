-- ============================================================
-- 0003_functions.sql  —  트리거 & 승인 워크플로우 RPC
-- ============================================================

-- ── 새 auth 사용자 → profiles 자동 생성 ──────────────────────
-- 역할은 생성 시 app_metadata.role 에서 가져오며 기본값 'parent'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_app_meta_data ->> 'role', 'parent'),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── decide_request : 요청 승인/반려를 원자적으로 처리 ────────
-- p_decision: 'approved' | 'rejected'
-- 승인 시 일정 반영(추가 insert / 변경 update / 취소 update).
-- EXCLUDE 제약 위반(중복 예약) 시 예외가 호출자에게 전파된다.
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
      insert into public.schedules (student_id, starts_at, ends_at, status, source, created_by)
      values (r.student_id, r.proposed_starts, r.proposed_ends, 'confirmed', 'added', auth.uid());
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

grant execute on function public.decide_request(uuid, text, text) to authenticated;
