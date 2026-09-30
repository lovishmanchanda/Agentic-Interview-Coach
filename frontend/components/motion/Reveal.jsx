"use client";

import { motion } from "motion/react";

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];

/** Fades and lifts its content in the first time it scrolls into view. */
export default function Reveal({ as = "div", delay = 0, y = 16, className, children, ...props }) {
  const Tag = motion[as];
  return (
    <Tag
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT_EXPO }}
      className={className}
      {...props}
    >
      {children}
    </Tag>
  );
}

const STAGGER = { hidden: {}, shown: { transition: { staggerChildren: 0.08 } } };
const ITEM = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
};

/** A list whose items arrive one after another when it scrolls into view. Use with <StaggerItem>. */
export function Stagger({ as = "div", className, children, ...props }) {
  const Tag = motion[as];
  return (
    <Tag initial="hidden" whileInView="shown" viewport={{ once: true, margin: "0px 0px -10% 0px" }} variants={STAGGER}
      className={className} {...props}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ as = "div", className, children, ...props }) {
  const Tag = motion[as];
  return <Tag variants={ITEM} className={className} {...props}>{children}</Tag>;
}
