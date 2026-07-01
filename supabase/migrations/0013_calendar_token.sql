-- ============================================================
-- 0013_calendar_token.sql — 학생별 캘린더 구독(웹캘린더) 토큰
--
-- 선생님이 학생별 .ics 구독 URL(webcal)을 발급하면, 맥·아이폰 캘린더 앱이
-- 이 토큰이 담긴 공개 엔드포인트(/api/calendar/<token>)를 주기적으로 폴링해
-- 항상 최신 일정으로 동기화한다.
-- 토큰은 추측 불가능한 비밀값(capability URL)이며, 발급은 선생님만 가능.
-- 피드 자체는 인증 없이 service_role 로 조회되므로 RLS 정책은 불필요하다.
-- ============================================================

alter table public.students
  add column if not exists calendar_token text unique;
