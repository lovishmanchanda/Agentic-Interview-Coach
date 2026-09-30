import Spinner from "@/components/ui/Spinner";

/** Shown inside the app shell while the next page's code loads. */
export default function Loading() {
  return (
    <div className="flex justify-center py-24">
      <Spinner label="Loading…" />
    </div>
  );
}
