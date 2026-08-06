import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Student, Profile } from "@/lib/types";
import { ParentForm } from "./ParentForm";
import { StudentManager } from "./StudentManager";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { ResetPasswordButton } from "./ResetPasswordButton";

export default async function AdminStudentsPage() {
  const supabase = await createClient();

  // 학부모 로그인 아이디(이메일) 매핑 — profiles 엔 없으므로 admin API 로 조회
  const admin = createAdminClient();

  const [{ data: parentRows }, { data: studentRows }, { data: userList }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "parent")
        .order("created_at", { ascending: true }),
      supabase
        .from("students")
        .select("*")
        .order("created_at", { ascending: true }),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  const parents = (parentRows ?? []) as Profile[];
  const students = (studentRows ?? []) as Student[];
  const emailById = new Map(
    (userList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );
  const domain =
    process.env.NEXT_PUBLIC_PARENT_EMAIL_DOMAIN ?? "parents.tutorhub.local";
  const loginIdOf = (id: string) => {
    const email = emailById.get(id) ?? "";
    return email.endsWith(`@${domain}`) ? email.split("@")[0] : email;
  };

  const studentsByParent = new Map<string, Student[]>();
  for (const s of students) {
    if (!s.parent_id) continue;
    (
      studentsByParent.get(s.parent_id) ??
      studentsByParent.set(s.parent_id, []).get(s.parent_id)!
    ).push(s);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">학생 / 계정 관리</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">학부모 추가</h2>
        <ParentForm />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">등록된 계정 ({parents.length})</h2>
        {parents.length === 0 ? (
          <p className="rounded-lg border border-black/10 p-3 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            아직 등록된 학부모 계정이 없습니다.
          </p>
        ) : (
          <ul className="space-y-3">
            {parents.map((p) => (
              <li
                key={p.id}
                className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{loginIdOf(p.id)}</span>
                  {p.display_name && (
                    <span className="text-sm text-black/60 dark:text-white/60">
                      {p.display_name}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <ResetPasswordButton parentId={p.id} loginId={loginIdOf(p.id)} />
                    <DeleteAccountButton parentId={p.id} loginId={loginIdOf(p.id)} />
                  </div>
                </div>
                <StudentManager
                  parentId={p.id}
                  students={studentsByParent.get(p.id) ?? []}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
