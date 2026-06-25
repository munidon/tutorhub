import { ChangePasswordForm } from "./ChangePasswordForm";

export default function ParentSettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">설정</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">비밀번호 재설정</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
