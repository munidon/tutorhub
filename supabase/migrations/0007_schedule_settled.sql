-- ============================================================
-- 0007_schedule_settled.sql — '직접 정산(수령 완료)' 표시
-- settled=true 인 조정분(추가/변경/취소)은 다음 달 이월에서 제외하고
-- '직접 수령'으로 별도 집계한다. (현금 등으로 이미 받은 경우)
-- ============================================================

alter table public.schedules add column if not exists settled boolean not null default false;
alter table public.schedules add column if not exists settled_at timestamptz;
