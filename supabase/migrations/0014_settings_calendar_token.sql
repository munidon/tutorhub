-- ============================================================
-- 0014_settings_calendar_token.sql — 전체 학생 캘린더 구독(webcal) 토큰
--
-- 개별 학생은 students.calendar_token(0013), '전체 학생' 구독은 특정 학생 행에
-- 붙일 수 없으므로 싱글톤 settings 에 별도 비밀 토큰을 둔다.
-- /api/calendar/<token> 는 학생 토큰 → settings 토큰 순으로 매칭한다.
-- ============================================================

alter table public.settings
  add column if not exists calendar_token text unique;
