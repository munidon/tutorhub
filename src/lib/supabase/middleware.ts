import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** 로그인 없이 접근 가능한 경로 (정확 일치 또는 접두) */
// /api/calendar: 캘린더 앱이 인증 없이 폴링하는 구독(webcal) 피드 — 비밀 토큰으로 보호
const PUBLIC_PATHS = ["/login", "/auth", "/api/calendar"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * 모든 요청에서 Supabase 세션을 갱신하고, 미인증 사용자를 /login 으로 보낸다.
 * 역할(teacher/parent) 기반 화면 분기는 각 레이아웃(서버 컴포넌트)에서 처리한다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() 는 JWT 를 로컬(JWKS)로 검증한다 — Auth 서버 왕복 없음.
  // 만료 임박 시에는 세션 refresh 도 수행한다. 호출 전에 다른 로직을 넣지 말 것.
  // (레거시 HS256 서명 키 프로젝트에서는 서버 검증으로 폴백되므로 비대칭 키 권장)
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : (data?.claims ?? null);

  const { pathname } = request.nextUrl;

  // 미인증 + 보호된 경로 → 로그인으로
  if (!claims && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 인증됨 + 로그인 페이지 → 홈(역할별 분기는 / 에서)
  if (claims && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
