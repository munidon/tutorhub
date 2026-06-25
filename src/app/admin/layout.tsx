import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

const NAV = [
  { href: "/admin", label: "정산" },
  { href: "/admin/calendar", label: "캘린더" },
  { href: "/admin/requests", label: "요청" },
  { href: "/admin/students", label: "학생/계정" },
  { href: "/admin/settings", label: "설정" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("teacher");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <span className="font-semibold">TutorHub · 선생님</span>
        <nav className="flex flex-wrap gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-black/60 dark:text-white/60">
            {profile.display_name ?? "선생님"}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
