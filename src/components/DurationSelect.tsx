import { DURATION_OPTIONS, durationLabel } from "@/lib/schedule";

/** 수업 시간 선택 (1시간~6시간, 30분 단위). 종료 시간 대신 사용. */
export function DurationSelect({
  name = "duration",
  defaultValue = 60,
  className,
}: {
  name?: string;
  defaultValue?: number;
  className?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={className}>
      {DURATION_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {durationLabel(m)}
        </option>
      ))}
    </select>
  );
}
