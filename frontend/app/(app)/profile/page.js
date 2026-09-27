import ProfileWizard from "@/components/profile/ProfileWizard";
import Card from "@/components/ui/Card";

export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted">Your role, experience and preferences shape every interview.</p>
      </div>
      <Card>
        <ProfileWizard mode="edit" />
      </Card>
    </div>
  );
}
