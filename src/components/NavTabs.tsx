"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

/** Link 자손에서만 호출 가능 — 이동 대기 중이면 라벨을 흐리게 표시 */
function TabLabel({ text }: { text: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? "opacity-50 transition-opacity" : undefined}>
      {text}
    </span>
  );
}

/** 상단 탭 네비게이션 — 현재 경로 하이라이트 + 전환 중 피드백 */
export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {items.map((n) => {
        // /admin 은 모든 admin 경로의 접두이므로 정확 일치로만 활성 처리
        const active =
          n.href === "/admin"
            ? pathname === "/admin"
            : pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2 py-1 ${
              active
                ? "bg-black/10 font-medium dark:bg-white/15"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <TabLabel text={n.label} />
          </Link>
        );
      })}
    </nav>
  );
}
