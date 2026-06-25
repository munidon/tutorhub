import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * 서비스 롤(service_role) Supabase 클라이언트 — RLS 를 우회한다.
 * 학부모 계정 발급(auth.admin.createUser) 등 관리자 전용 서버 작업에만 사용.
 * !! 절대 클라이언트 컴포넌트에서 import 하지 말 것 (server-only 가드 적용). !!
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
