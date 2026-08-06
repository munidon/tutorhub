import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 컴포넌트 / 서버 액션 / 라우트 핸들러용 Supabase 클라이언트.
 * 요청 쿠키의 사용자 세션으로 동작하며 RLS 가 적용된다.
 * React.cache 로 같은 요청 안에서는 레이아웃/페이지가 클라이언트 1개를 공유한다.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 호출된 경우 set 이 무시될 수 있음.
            // 세션 갱신은 미들웨어(updateSession)에서 처리하므로 안전하다.
          }
        },
      },
    },
  );
});
