"use client";

import { motion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1];
const WORD = { hidden: { y: "110%" }, shown: { y: 0 } };

/**
 * A heading whose words rise out of a mask, one after another. Wrap words in *asterisks* to set them in the
 * italic serif accent: "Take the *seat.*". `animateOnMount` plays on load (hero); otherwise when scrolled into view.
 * Screen readers read the plain sentence once.
 *
 * The heading itself is what watches the viewport: each word starts clipped inside its mask, so a word can never
 * be "in view" on its own, and the heading passes the cue down to its words.
 */
export default function SplitHeading({ as = "h2", text, className = "", delay = 0, stagger = 0.07, animateOnMount = false, id }) {
  const Tag = motion[as];
  const words = text.split(" ").map((raw) => ({ word: raw.replace(/\*/g, ""), accent: raw.startsWith("*") }));
  const plain = words.map((w) => w.word).join(" ");
  const trigger = animateOnMount
    ? { animate: "shown" }
    : { whileInView: "shown", viewport: { once: true, margin: "0px 0px -8% 0px" } };

  return (
    <Tag id={id} className={className} aria-label={plain} initial="hidden" {...trigger}>
      {words.map(({ word, accent }, i) => (
        <span key={`${word}-${i}`} aria-hidden="true" className="inline-block overflow-hidden pb-[0.12em] align-bottom leading-[inherit]">
          <motion.span
            className={`inline-block pr-[0.24em] ${accent ? "font-serif font-normal italic tracking-[-0.02em]" : ""}`}
            variants={WORD}
            transition={{ duration: 1, delay: delay + i * stagger, ease: EASE }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
