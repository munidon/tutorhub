import { redirect } from "next/navigation";
import { getCurrentProfile, homePathFor } from "@/lib/auth";

// 진입점: 로그인 여부/역할에 따라 분기.
export default async function Home() {
  const profile = await getCurrentProfile(); // 미로그인 시 /login 으로
  redirect(homePathFor(profile.role));
}
