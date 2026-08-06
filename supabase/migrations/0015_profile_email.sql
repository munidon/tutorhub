-- ============================================================
-- 0015_profile_email.sql — profiles 에 로그인 이메일 저장
--
-- 학생/계정 페이지가 로그인 아이디 표시를 위해 매 렌더마다
-- auth admin listUsers(1000명) 를 호출하던 것을 제거하기 위함.
-- 계정 생성은 앱 내 관리자 액션(handle_new_user 트리거 경유)으로만
-- 이뤄지므로 트리거에서 email 을 함께 기록하면 항상 동기화된다.
-- ============================================================

alter table public.profiles add column if not exists email text;

-- 기존 계정 백필
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- 새 auth 사용자 → profiles 자동 생성 시 email 도 함께 기록
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, email)
  values (
    new.id,
    coalesce(new.raw_app_meta_data ->> 'role', 'parent'),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
