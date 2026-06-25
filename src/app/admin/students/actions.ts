"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ParentFormState = { ok?: boolean; error?: string };
export type StudentActionState = { ok?: boolean; error?: string };

// 비밀번호 분실 시 선생님이 발급하는 고정 초기 비밀번호.
// ("use server" 파일은 async 함수만 export 가능 → 상수는 비공개로 둔다)
const RESET_PASSWORD = "123456";

/**
 * 학부모 계정 발급(폐쇄형). 학생은 별도로 '학생 관리'에서 추가한다.
 * 이메일이 없을 수 있으므로 합성 이메일({id}@도메인)로 매핑.
 */
export async function createParentAction(
  _prev: ParentFormState,
  formData: FormData,
): Promise<ParentFormState> {
  await requireRole("teacher");

  const loginId = String(formData.get("parent_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!loginId) return { error: "학부모 로그인 아이디를 입력하세요." };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 합니다." };

  const domain =
    process.env.NEXT_PUBLIC_PARENT_EMAIL_DOMAIN ?? "parents.tutorhub.local";
  const email = loginId.includes("@") ? loginId : `${loginId}@${domain}`;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "parent" },
    user_metadata: { display_name: displayName || loginId },
  });
  if (error) return { error: `계정 생성 실패: ${error.message}` };

  revalidatePath("/admin/students");
  return { ok: true };
}

/**
 * 학부모 비밀번호 초기화 — 분실 시 선생님이 고정 초기 비밀번호(123456)로 재발급.
 * 학부모는 이후 설정 탭에서 직접 변경하도록 안내한다.
 */
export async function resetParentPasswordAction(
  _prev: ParentFormState,
  formData: FormData,
): Promise<ParentFormState> {
  await requireRole("teacher");

  const id = String(formData.get("parent_id") ?? "");
  if (!id) return { error: "학부모 정보가 없습니다." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    password: RESET_PASSWORD,
  });
  if (error) return { error: `초기화 실패: ${error.message}` };

  return { ok: true };
}

/** 기존 학부모에게 자녀(학생) 추가. */
export async function addStudentAction(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  await requireRole("teacher");

  const parentId = String(formData.get("parent_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#3b82f6");

  if (!parentId) return { error: "학부모 정보가 없습니다." };
  if (!name) return { error: "학생 이름을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .insert({ name, parent_id: parentId, color });
  if (error) return { error: `학생 추가 실패: ${error.message}` };

  revalidatePath("/admin/students");
  return { ok: true };
}

/** 학생 색상/시급 수정. */
export async function updateStudentAction(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  await requireRole("teacher");

  const id = String(formData.get("student_id") ?? "");
  const color = String(formData.get("color") ?? "");
  const rateRaw = String(formData.get("hourly_rate") ?? "").trim();
  if (!id) return { error: "학생 정보가 없습니다." };

  const patch: { color?: string; hourly_rate?: number | null } = {};
  if (color) patch.color = color;
  if (rateRaw === "") {
    patch.hourly_rate = null;
  } else {
    const rate = Number(rateRaw);
    if (!Number.isFinite(rate) || rate < 0)
      return { error: "시급을 올바르게 입력하세요." };
    patch.hourly_rate = Math.round(rate);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").update(patch).eq("id", id);
  if (error) return { error: `수정 실패: ${error.message}` };

  revalidatePath("/admin/students");
  revalidatePath("/admin/calendar");
  return { ok: true };
}

/** 학생 제거(비활성화) — 기록은 보존하고 캘린더에서만 숨긴다. */
export async function deactivateStudentAction(formData: FormData): Promise<void> {
  await requireRole("teacher");
  const id = String(formData.get("student_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("students").update({ active: false }).eq("id", id);
  revalidatePath("/admin/students");
  revalidatePath("/admin/calendar");
}

/** 비활성화된 학생 복구. */
export async function reactivateStudentAction(formData: FormData): Promise<void> {
  await requireRole("teacher");
  const id = String(formData.get("student_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("students").update({ active: true }).eq("id", id);
  revalidatePath("/admin/students");
  revalidatePath("/admin/calendar");
}

/**
 * 학부모 계정 영구 삭제 — 계정 + 자녀 + 그 자녀의 모든 일정/요청까지 삭제.
 * 학생 삭제로 schedules/requests 가 cascade, auth 사용자 삭제로 profiles 가 cascade 된다.
 */
export async function deleteParentAction(formData: FormData): Promise<void> {
  await requireRole("teacher");
  const id = String(formData.get("parent_id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  // 자녀(학생) 삭제 → 해당 학생의 일정/요청 cascade 삭제
  await admin.from("students").delete().eq("parent_id", id);
  // 로그인(auth) 계정 삭제 → profiles cascade 삭제
  await admin.auth.admin.deleteUser(id);

  revalidatePath("/admin/students");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
}
