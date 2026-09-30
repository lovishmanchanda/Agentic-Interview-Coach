import ProfileWizard from "@/components/profile/ProfileWizard";
import SceneBackdrop from "@/components/three/SceneBackdrop";

export const metadata = { title: "Set up your profile" };

export default function ProfileSetupPage() {
  return (
    <div className="relative space-y-8">
      <SceneBackdrop />
      {/* A soft spotlight from above: the room, before VERA begins */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[40rem] max-w-[100vw] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(230_236_245/0.08),transparent)]" />
      <div className="relative">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Welcome</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Before VERA <span className="font-serif font-normal italic tracking-[-0.02em]">begins.</span>
        </h1>
        <p className="mt-3 text-muted">Four quick steps. Every interview and every word from ARIA is tailored from this.</p>
      </div>
      <div className="relative rounded-[1.75rem] border border-border-strong bg-surface/80 p-5 backdrop-blur sm:p-8">
        <ProfileWizard mode="create" />
      </div>
    </div>
  );
}
