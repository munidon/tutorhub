-- ============================================================
-- 0012_drop_telegram_chat_id.sql — 죽은 설정 필드 제거
--
-- 알림 Edge Function(notify-telegram)은 chat_id 를 DB 가 아니라
-- 환경 시크릿(TELEGRAM_CHAT_ID)에서 읽는다. settings.telegram_chat_id 는
-- 어디서도 소비되지 않는 잔재였으므로 제거한다.
-- ============================================================

alter table public.settings drop column if exists telegram_chat_id;
