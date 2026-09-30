"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";

/**
 * Each page arrives with a short fade and lift. Enter-only on purpose: an exit animation would hold the
 * old page on screen after navigation, which feels slow in an app you use every day.
 */
export default function PageTransition({ children, className }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
