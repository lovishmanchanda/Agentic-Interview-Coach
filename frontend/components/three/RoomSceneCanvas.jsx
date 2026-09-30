"use client";

import DeskItems from "./DeskItems";
import InterviewRoom from "./InterviewRoom";
import SceneCanvas from "./SceneCanvas";

/** The lazily loaded half of RoomScene: the canvas, the room and (on the dashboard) what's on the desk. */
export default function RoomSceneCanvas({ preset, progress, lightOn, parallax, framing, intro, desk, label, paused, fullscreen }) {
  return (
    <SceneCanvas className="absolute inset-0" label={label} paused={paused} fullscreen={fullscreen}>
      <InterviewRoom preset={preset} progress={progress} lightOn={lightOn} parallax={parallax} framing={framing} intro={intro}>
        {desk && <DeskItems {...desk} />}
      </InterviewRoom>
    </SceneCanvas>
  );
}
