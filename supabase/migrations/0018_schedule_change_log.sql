-- ============================================================
-- 0018_schedule_change_log.sql — 수업 변경 이력
--
-- 일정이 어떻게 움직여 왔는지 내부 기록을 남긴다.
-- 정산·라벨 계산은 schedules.origin_* 만으로 이루어지므로 이 테이블은
-- 순수 조회용이다. (수업 상세 모달에서 열람 — SHOW_CHANGE_LOG 로 on/off)
--
-- 완전 삭제(deleteScheduleAction)는 on delete cascade 로 로그도 함께 지운다.
-- '기록에 남지 않는 삭제'라는 기존 의미를 유지하기 위한 의도된 동작.
-- ============================================================

create table if not exists public.schedule_changes (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  kind        text not null check (kind in
                ('created','changed','reverted','cancelled','restored','settled','unsettled')),
  from_starts timestamptz,
  from_ends   timestamptz,
  to_starts   timestamptz,
  to_ends     timestamptz,
  changed_by  uuid references public.profiles(id),
  -- now() 는 트랜잭션 시각이라 한 번의 동작이 두 줄을 남길 때(예: 롤백 → reverted
  -- + unsettled) 값이 같아져 순서가 흔들린다. clock_timestamp() 로 실제 시각을 쓴다.
  changed_at  timestamptz not null default clock_timestamp()
);

create index if not exists schedule_changes_schedule_idx
  on public.schedule_changes (schedule_id, changed_at desc);

-- ── 기록 트리거 ──────────────────────────────────────────────
-- security definer: RLS(선생님 select 전용)를 우회해 insert 만 수행.
create or replace function public.log_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  -- FK 위반 방지: profiles 에 없는 주체(service role 등)는 null 로 기록
  select id into actor from public.profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.schedule_changes
      (schedule_id, kind, to_starts, to_ends, changed_by)
    values (new.id, 'created', new.starts_at, new.ends_at, actor);
    return null;
  end if;

  -- 시각 변경 — 최초값으로 돌아왔으면 'reverted'
  if new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at then
    insert into public.schedule_changes
      (schedule_id, kind, from_starts, from_ends, to_starts, to_ends, changed_by)
    values (
      new.id,
      case when new.starts_at = new.origin_starts_at
            and new.ends_at   = new.origin_ends_at
           then 'reverted' else 'changed' end,
      old.starts_at, old.ends_at, new.starts_at, new.ends_at, actor
    );
  end if;

  -- 취소 / 취소 해제
  if new.status is distinct from old.status then
    insert into public.schedule_changes
      (schedule_id, kind, from_starts, from_ends, to_starts, to_ends, changed_by)
    values (
      new.id,
      case when new.status = 'cancelled' then 'cancelled' else 'restored' end,
      old.starts_at, old.ends_at, new.starts_at, new.ends_at, actor
    );
  end if;

  -- 직접 수령 토글 (트리거의 자동 해제도 여기 기록됨)
  if new.settled is distinct from old.settled then
    insert into public.schedule_changes (schedule_id, kind, changed_by)
    values (new.id, case when new.settled then 'settled' else 'unsettled' end, actor);
  end if;

  return null;
end;
$$;

drop trigger if exists schedules_log_change on public.schedules;
create trigger schedules_log_change
  after insert or update on public.schedules
  for each row execute function public.log_schedule_change();

-- ── RLS: 선생님 조회 전용 (insert 는 트리거만) ───────────────
alter table public.schedule_changes enable row level security;

drop policy if exists schedule_changes_select on public.schedule_changes;
create policy schedule_changes_select on public.schedule_changes
  for select using ((select public.is_teacher()));
