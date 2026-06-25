// DB 테이블과 1:1 대응하는 타입 정의 (supabase/migrations 와 동기화 유지).
// 추후 `supabase gen types typescript` 로 자동 생성으로 대체 가능.

export type Role = "teacher" | "parent";
export type ScheduleStatus = "confirmed" | "cancelled";
/** 수업 구분: 정규 / 추가 / 변경 / 취소 (현재 상태) */
export type ScheduleCategory = "regular" | "added" | "changed" | "cancelled";
/** 원본 구분: 생성 시 고정 (정규로 계획 / 추가로 생성) */
export type ScheduleBaseCategory = "regular" | "added";
export type RequestType = "add" | "change" | "cancel";
export type RequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface Profile {
  id: string;
  role: Role;
  display_name: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  active: boolean;
  // v2 컬럼 (현재 nullable)
  hourly_rate: number | null;
  lesson_duration: number | null;
  monthly_count: number | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  student_id: string;
  starts_at: string;
  ends_at: string;
  status: ScheduleStatus;
  category: ScheduleCategory;
  base_category: ScheduleBaseCategory;
  prev_starts: string | null;
  prev_ends: string | null;
  // 직접 정산(현금 등으로 이미 받음) — 이월에서 제외
  settled: boolean;
  settled_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeRequest {
  id: string;
  student_id: string;
  schedule_id: string | null;
  type: RequestType;
  proposed_starts: string | null;
  proposed_ends: string | null;
  note: string | null;
  status: RequestStatus;
  reject_reason: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  bank_account: string | null; // 레거시(자유텍스트) — 호환용
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
}

/** 계좌 정보(학부모 청구서 노출용, bank_info RPC 반환) */
export interface BankInfo {
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
}

/** 학생×월 입금 확인 (행 존재 = 확인됨) */
export interface Payment {
  id: string;
  student_id: string;
  ym: string; // 'YYYY-MM' (KST 청구월)
  confirmed_at: string;
  confirmed_by: string | null;
}

/** 학생별 반복 일정 템플릿 */
export interface RecurrenceTemplate {
  id: string;
  student_id: string;
  weekday: number; // 0=일 … 6=토
  start_minute: number; // 자정부터 분(30분 단위)
  duration: number; // 분(60~360)
  created_at: string;
}
