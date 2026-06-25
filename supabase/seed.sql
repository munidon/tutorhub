-- ============================================================
-- seed.sql  —  초기 데이터
-- ============================================================

-- settings 단일 행 보장
insert into public.settings (id)
values (1)
on conflict (id) do nothing;

-- ── 선생님 계정 지정 (수동 단계) ─────────────────────────────
-- 1) Supabase 대시보드 > Authentication > Users > "Add user" 로
--    선생님 이메일/비밀번호 계정을 먼저 생성한다.
-- 2) 아래 이메일을 본인 것으로 바꾼 뒤 실행하면 해당 계정이 teacher 가 된다.
--
-- update public.profiles
--   set role = 'teacher'
--   where id = (select id from auth.users where email = 'teacher@example.com');
