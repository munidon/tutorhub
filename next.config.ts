import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 좌측 하단 Next.js 개발 표시(dev indicator) 숨김
  devIndicators: false,
  experimental: {
    // 클라이언트 라우터 캐시: 최근 방문한 탭은 30초간 서버 재요청 없이 즉시 표시.
    // 서버 액션의 revalidatePath 가 캐시를 무효화하므로 본인 변경은 즉시 반영된다.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
