"use client";

import dynamic from "next/dynamic";

import RoomPoster from "./RoomPoster";

/**
 * The interview room as one component for pages to drop in (landing hero, auth background, dashboard desk).
 * three.js is loaded lazily and only in the browser, so pages without 3D never download it, and the page
 * paints straight away with the poster while the scene loads.
 *
 * <RoomScene preset="landing" progress={scrollProgress} lightOn={hovering} parallax />
 * <RoomScene preset="desk" desk={{ reports, nextStep, onOpenReport, onNextStep }} />
 *
 * `className` must give the box a size and a position (e.g. "absolute inset-0", or "relative h-96"): the canvas fills it.
 */
const Scene = dynamic(() => import("./RoomSceneCanvas"), { ssr: false, loading: () => null });

/**
 * Underneath the canvas sits a still of the room, covered once the (opaque) canvas draws. With `intro`, the
 * underlay is just darkness instead, so the spotlight's first flicker is the first light you see.
 */
export default function RoomScene({ className = "relative h-96", ...props }) {
  return (
    <div className={className}>
      {props.intro ? <div aria-hidden="true" className="absolute inset-0 bg-background" /> : <RoomPoster className="absolute inset-0" />}
      <Scene {...props} />
    </div>
  );
}
