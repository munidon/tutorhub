import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: 기존 middleware 컨벤션을 대체하는 proxy.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 다음을 제외한 모든 경로에서 실행:
     * - _next/static, _next/image (정적 자원)
     * - favicon, 이미지 등 정적 파일
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
