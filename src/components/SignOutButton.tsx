// 로그아웃 폼 (서버 라우트 핸들러로 POST)
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        로그아웃
      </button>
    </form>
  );
}
