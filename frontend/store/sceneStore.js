"use client";

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

/**
 * One interview room for the whole site. <SceneHost /> in the root layout owns the only 3D canvas; pages ask
 * for a shot with useScene({ preset, framing, … }). Because the root layout survives navigation, the canvas is
 * never torn down between pages: landing → sign-up → dashboard is one continuous camera move.
 *
 * A page that leaves hands the scene back after a short grace period, so the next page can claim it first
 * (claiming changes the owner, and the late release is then ignored).
 */
const RELEASE_GRACE_MS = 400;

export const useSceneStore = create((set, get) => ({
  owner: null,
  active: false,
  everActive: false,
  props: {},
  // { sessionId, full }: the interview page plays the walk to the table once for this session; `full` (your first
  // interview) is the whole scene, otherwise it only covers VERA's preparation and never delays the question.
  introFor: null,
  override: null, // props a section of the page plays instead, while it's on screen (useSceneOverride)
  claim: (owner, props) => set({ owner, active: true, everActive: true, props }),
  release: (owner) => {
    if (get().owner === owner) set({ active: false });
  },
}));

/** Show the room behind this page with these RoomScene props (preset, framing, lightOn, desk, opacity, …). */
export function useScene(props) {
  // A token unique to this mount. (Not useId: ids from two different page trees can be equal, and the leaving
  // page's late release would then switch off the page that just claimed the scene.)
  const [id] = useState(() => ({}));
  // Every render passes the latest props (they change with hover, data, the leaving animation…).
  useEffect(() => {
    useSceneStore.getState().claim(id, props);
  });
  // Release only if this page is really gone by then: React's dev StrictMode unmounts and remounts once, and
  // that remount must keep the scene.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) useSceneStore.getState().release(id);
      }, RELEASE_GRACE_MS);
    };
  }, [id]);
}

/**
 * While `props` is set, the room plays these instead of the page's own shot (the landing page's loop story takes
 * over the room while it's on screen, then hands it back to the hero). null, or unmounting, hands it back.
 */
export function useSceneOverride(props) {
  useEffect(() => {
    useSceneStore.setState({ override: props });
  });
  useEffect(() => () => useSceneStore.setState({ override: null }), []);
}
