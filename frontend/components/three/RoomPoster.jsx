/**
 * A still of the interview room in plain CSS and SVG: shown while the 3D scene loads, and instead of it when
 * the browser has no WebGL. Same composition as the "landing" preset, so the swap is barely visible.
 */
export default function RoomPoster({ className = "" }) {
  return (
    <div aria-hidden="true" className={`relative overflow-hidden bg-background ${className}`}>
      <div className="absolute inset-x-0 top-0 mx-auto h-full w-[min(60vw,34rem)] bg-[linear-gradient(to_bottom,rgb(230_236_245/0.14),rgb(230_236_245/0.02)_85%,transparent)] [clip-path:polygon(48%_0,52%_0,100%_100%,0_100%)]" />
      <div className="absolute bottom-[14%] left-1/2 h-[12%] w-[min(50vw,28rem)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(230_236_245/0.2),transparent)]" />
      <svg viewBox="0 0 100 100" className="absolute bottom-[16%] left-1/2 h-[24%] -translate-x-1/2" fill="none">
        <path d="M34 18 L40 58 H70 M40 58 L36 92 M70 58 L73 92 M38 78 H72" stroke="#3a3a40" strokeWidth="4" strokeLinecap="round"
          strokeLinejoin="round" />
      </svg>
    </div>
  );
}
