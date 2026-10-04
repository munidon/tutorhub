-- ============================================================
-- 0017_schedule_origin.sql — '최초 계획값(origin)' 기준으로 전환
--
-- 기존: prev_starts/prev_ends 는 '직전 값' 한 칸이라
--   · 원래 시간으로 되돌려도 되돌렸는지 알 수 없고 ('변경' 라벨이 영구히 남음)
--   · 두 번 이상 변경하면 '당초 계획'이 중간값으로 덮여 정산이 어긋났다.
--
-- 변경: 생성 시점의 시간을 origin_* 에 고정(불변)하고,
--   '변경 여부'와 '정산 대상 여부'를 저장 플래그가 아니라 origin 대비 계산으로 도출한다.
--   category 는 트리거가 계산하는 파생값이 되며 앱은 더 이상 직접 쓰지 않는다.
--   (prev_* 는 '직전 값'이라는 별개 의미로 남겨둔다 — 요청 상세의 '전 → 후' 표기용)
-- ============================================================

alter table public.schedules
  add column if not exists origin_starts_at timestamptz,
  add column if not exists origin_ends_at   timestamptz;

-- 기존 행 백필: prev_* 가 있으면 그게 최선의 기준, 없으면 현재값이 곧 원본
update public.schedules
   set origin_starts_at = coalesce(prev_starts, starts_at),
       origin_ends_at   = coalesce(prev_ends,   ends_at)
 where origin_starts_at is null or origin_ends_at is null;

alter table public.schedules
  alter column origin_starts_at set not null,
  alter column origin_ends_at   set not null;

-- ── 파생값 계산 트리거 ───────────────────────────────────────
-- 선생님 직접 수정 / 학부모 요청 승인(decide_request) / 취소 / 취소 해제
-- 네 경로가 모두 이 트리거를 지나므로 category 규칙이 한 곳에만 존재한다.
create or replace function public.set_schedule_derived()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- 생성 시점의 시간이 곧 '당초 계획'
    new.origin_starts_at := coalesce(new.origin_starts_at, new.starts_at);
    new.origin_ends_at   := coalesce(new.origin_ends_at,   new.ends_at);
    new.prev_starts := null;
    new.prev_ends   := null;
  else
    -- origin 은 불변 — 앱이 무엇을 보내든 최초값 유지
    new.origin_starts_at := old.origin_starts_at;
    new.origin_ends_at   := old.origin_ends_at;
    -- prev_* 는 '직전 값' — 시각이 실제로 바뀐 경우에만 갱신
    if new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at then
      new.prev_starts := old.starts_at;
      new.prev_ends   := old.ends_at;
    end if;
  end if;

  -- category 재계산 (앱이 보낸 값은 무시)
  if new.status = 'cancelled' then
    new.category := 'cancelled';
  elsif new.starts_at is distinct from new.origin_starts_at
     or new.ends_at   is distinct from new.origin_ends_at then
    new.category := 'changed';
  else
    new.category := new.base_category;
  end if;

  -- 조정분이 0으로 돌아왔으면 '직접 수령' 표시도 함께 해제
  -- (되돌렸는데 정산 표시만 남는 상황 방지)
  if new.base_category = 'regular'
     and new.status = 'confirmed'
     and new.starts_at = new.origin_starts_at
     and new.ends_at   = new.origin_ends_at
     and new.settled then
    new.settled    := false;
    new.settled_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists schedules_set_derived on public.schedules;
create trigger schedules_set_derived
  before insert or update on public.schedules
  for each row execute function public.set_schedule_derived();

-- ── 기존 행의 category 를 새 규칙으로 정합화 ─────────────────
-- 실제로 값이 달라지는 행만 손댄다(대부분은 이미 일치).
-- 대표적으로 바뀌는 경우: 모달을 열고 그대로 저장해 prev_* 만 채워진 채
-- 'changed' 로 남아 있던 행 → origin 과 같으므로 정규/추가로 복귀.
-- updated_at 이 통째로 밀리지 않도록 갱신 트리거는 잠시 꺼둔다.
alter table public.schedules disable trigger schedules_touch_updated_at;

update public.schedules s
   set category = case
         when s.status = 'cancelled' then 'cancelled'
         when s.starts_at is distinct from s.origin_starts_at
           or s.ends_at   is distinct from s.origin_ends_at then 'changed'
         else s.base_category
       end
 where s.category is distinct from (case
         when s.status = 'cancelled' then 'cancelled'
         when s.starts_at is distinct from s.origin_starts_at
           or s.ends_at   is distinct from s.origin_ends_at then 'changed'
         else s.base_category
       end);

alter table public.schedules enable trigger schedules_touch_updated_at;
