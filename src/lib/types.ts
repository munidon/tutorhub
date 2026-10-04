// DB 테이블과 1:1 대응하는 타입 정의 (supabase/migrations 와 동기화 유지).
// 추후 `supabase gen types typescript` 로 자동 생성으로 대체 가능.

export type Role = "teacher" | "parent";
export type ScheduleStatus = "confirmed" | "cancelled";
/**
 * 수업 구분: 정규 / 추가 / 변경 / 취소 (현재 상태).
 * DB 트리거 set_schedule_derived() 가 origin_* 대비 계산해 채우는 **파생값**이다.
 * 앱은 읽지도 쓰지도 말 것 — 라벨은 scheduleTag(), 정산은 adjustmentIn() 을 쓴다.
 */
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
  /** 로그인 이메일 (handle_new_user 트리거가 auth.users 에서 복사) */
  email: string | null;
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
  // 캘린더 구독(webcal) 비밀 토큰 — 발급 전엔 null
  calendar_token: string | null;
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
  /** 최초 계획된 시간 — 생성 시 고정되고 이후 절대 바뀌지 않는다(변경·정산 판정 기준) */
  origin_starts_at: string;
  origin_ends_at: string;
  /** 직전 값 — 요청 상세의 '전 → 후' 표기용. 판정 기준으로 쓰지 말 것 */
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
  // 전체 학생 캘린더 구독(webcal) 비밀 토큰 — 발급 전엔 null
  calendar_token: string | null;
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

/** 수업 변경 이력 (schedule_changes) — 트리거가 자동 기록 */
export type ScheduleChangeKind =
  | "created"
  | "changed"
  | "reverted"
  | "cancelled"
  | "restored"
  | "settled"
  | "unsettled";

export interface ScheduleChange {
  id: string;
  schedule_id: string;
  kind: ScheduleChangeKind;
  from_starts: string | null;
  from_ends: string | null;
  to_starts: string | null;
  to_ends: string | null;
  changed_by: string | null;
  changed_at: string;
}
