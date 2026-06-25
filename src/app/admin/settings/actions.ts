"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hhmmToMinutes } from "@/lib/recurrence";
import { isValidDuration } from "@/lib/schedule";

export async function updateSettingsAction(formData: FormData) {
  await requireRole("teacher");

  const clean = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const bank_name = clean("bank_name");
  const account_number = clean("account_number");
  const account_holder = clean("account_holder");

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ bank_name, account_number, account_holder })
    .eq("id", 1);

  if (error) console.error("update settings failed:", error.message);
  revalidatePath("/admin/settings");
  revalidatePath("/calendar"); // 학부모 청구서 계좌 안내 갱신
}

/** 반복 일정 템플릿 추가 (학생별: 요일·시작시각·길이) */
export async function addTemplateAction(formData: FormData) {
  await requireRole("teacher");

  const studentId = String(formData.get("student_id") ?? "");
  const weekday = Number(formData.get("weekday") ?? "");
  const startMinute = hhmmToMinutes(String(formData.get("start") ?? ""));
  const duration = Number(formData.get("duration") ?? "");

  if (
    !studentId ||
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6 ||
    startMinute == null ||
    startMinute % 30 !== 0 ||
    !isValidDuration(duration)
  ) {
    return; // 입력값은 select/time 으로 제약됨 — 비정상값은 무시
  }

  const supabase = await createClient();
  const { error } = await supabase.from("recurrence_templates").insert({
    student_id: studentId,
    weekday,
    start_minute: startMinute,
    duration,
  });
  if (error) console.error("add template failed:", error.message);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/calendar"); // 수업 추가의 템플릿 목록 갱신
}

/** 반복 일정 템플릿 삭제 */
export async function deleteTemplateAction(formData: FormData) {
  await requireRole("teacher");

  const id = String(formData.get("template_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurrence_templates")
    .delete()
    .eq("id", id);
  if (error) console.error("delete template failed:", error.message);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/calendar");
}
