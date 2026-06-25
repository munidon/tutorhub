-- ============================================================
-- 0010_payments_and_bank.sql — 학부모 청구서 입금 안내 & 입금 확인
--
-- (A2) 계좌를 구조화(은행/계좌번호/예금주)해 '계좌번호만 복사' 가능하게 하고,
--      학생×월 단위 입금 확인(payments)을 선생님이 토글 → 학부모 청구서에 반영.
-- ============================================================

-- 1) settings: 구조화된 계좌 필드 (기존 bank_account 자유텍스트는 호환용으로 유지)
alter table public.settings add column if not exists bank_name text;
alter table public.settings add column if not exists account_number text;
alter table public.settings add column if not exists account_holder text;

-- 2) payments: 학생×월(YYYY-MM, KST 청구월) 입금 확인. 행 존재 = 확인됨.
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  ym            text not null check (ym ~ '^\d{4}-\d{2}$'),
  confirmed_at  timestamptz not null default now(),
  confirmed_by  uuid references public.profiles(id),
  unique (student_id, ym)
);
create index if not exists payments_student_ym_idx on public.payments(student_id, ym);

alter table public.payments enable row level security;

-- 조회: 선생님 전체, 학부모는 본인 자녀만
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (public.is_teacher() or public.owns_student(student_id));

-- 생성/수정/삭제: 선생님만
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments
  for all using (public.is_teacher()) with check (public.is_teacher());

-- 3) bank_info(): 계좌 정보만 노출하는 RPC.
--    settings 는 teacher-only RLS(telegram_chat_id 등 민감) 라 학부모가 직접 못 읽음 →
--    계좌 3필드만 security definer 로 반환.
create or replace function public.bank_info()
returns table(bank_name text, account_number text, account_holder text)
language sql
security definer
set search_path = public
as $$
  select bank_name, account_number, account_holder
  from public.settings where id = 1;
$$;
grant execute on function public.bank_info() to authenticated;
