'use client';

import { motion, useReducedMotion } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Scroll reveal: the block rises 24px into place the first time it is
 *  mostly on screen, so a section arrives in reading order (heading, then
 *  what it introduces). Transform and opacity only; static under reduced
 *  motion. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      // The same first frame on the server and the client (a reduced-motion
      // branch here is a hydration mismatch that strands the block at
      // opacity 0); reduced motion only makes the step instant.
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
