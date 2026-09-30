"use client";

import { motion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1];

/**
 * A heading whose words rise out of a mask, one after another. Wrap words in *asterisks* to set them in the
 * italic serif accent: "Take the *seat.*". `animateOnMount` plays on load (hero); otherwise when scrolled into view.
 * Screen readers read the plain sentence once.
 */
export default function SplitHeading({ as: Tag = "h2", text, className = "", delay = 0, stagger = 0.07, animateOnMount = false, id }) {
  const words = text.split(" ").map((raw) => ({ word: raw.replace(/\*/g, ""), accent: raw.startsWith("*") }));
  const plain = words.map((w) => w.word).join(" ");
  const trigger = animateOnMount ? { animate: { y: 0 } } : { whileInView: { y: 0 }, viewport: { once: true, margin: "0px 0px -8% 0px" } };

  return (
    <Tag id={id} className={className} aria-label={plain}>
      {words.map(({ word, accent }, i) => (
        <span key={`${word}-${i}`} aria-hidden="true" className="inline-block overflow-hidden pb-[0.12em] align-bottom leading-[inherit]">
          <motion.span
            className={`inline-block pr-[0.24em] ${accent ? "font-serif font-normal italic tracking-[-0.02em]" : ""}`}
            initial={{ y: "110%" }}
            transition={{ duration: 1, delay: delay + i * stagger, ease: EASE }}
            {...trigger}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
