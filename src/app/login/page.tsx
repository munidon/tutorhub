"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const domain =
      process.env.NEXT_PUBLIC_PARENT_EMAIL_DOMAIN ?? "parents.tutorhub.local";
    const email = id.includes("@") ? id : `${id}@${domain}`;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });

    if (error) {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }
    // 새 세션 쿠키를 서버/미들웨어가 인식하도록 전체 새로고침으로 이동
    window.location.assign("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 shadow-sm dark:border-white/15"
      >
        <div>
          <h1 className="text-xl font-semibold">TutorHub 로그인</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            선생님께 받은 아이디로 로그인하세요.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">아이디</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">비밀번호</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground py-2 font-medium text-background disabled:opacity-50"
        >
          {loading ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
