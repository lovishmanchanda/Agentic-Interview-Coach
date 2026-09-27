import ProfileWizard from "@/components/profile/ProfileWizard";

export const metadata = { title: "Set up your profile" };

export default function ProfileSetupPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-primary">Welcome</p>
        <h1 className="mt-1 text-3xl font-semibold">Let&apos;s set up your profile</h1>
        <p className="mt-2 text-muted">Four quick steps. Every interview and mentor session is tailored from this.</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
        <ProfileWizard mode="create" />
      </div>
    </div>
  );
}
