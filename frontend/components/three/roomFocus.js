import { createContext } from "react";

/**
 * What you (the seated figure) are paying attention to, shared inside the room: the desk writes it when the
 * pointer is over a sheet or the next-step card, and <Candidate> turns to look (and leans in for the card).
 * The value is a ref: { point: THREE.Vector3 | null, lean: boolean }.
 */
export const RoomFocus = createContext(null);
