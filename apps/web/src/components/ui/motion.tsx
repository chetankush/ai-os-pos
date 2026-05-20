'use client';

import { motion, useReducedMotion, type HTMLMotionProps, type Transition } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE: Transition['ease'] = [0.22, 1, 0.36, 1];

interface FadeInProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  delay?: number;
  duration?: number;
  y?: number;
  children?: ReactNode;
}

export function FadeIn({ delay = 0, duration = 0.45, y = 8, children, ...rest }: FadeInProps) {
  const reduce = useReducedMotion();
  const yOffset = reduce ? 0 : y;
  const dur = reduce ? 0 : duration;
  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface StaggerProps {
  className?: string;
  children: ReactNode;
  stagger?: number;
}

export function Stagger({ className, children, stagger = 0.04 }: StaggerProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: reduce ? 0 : stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  className,
  children,
  y = 8,
}: {
  className?: string;
  children: ReactNode;
  y?: number;
}) {
  const reduce = useReducedMotion();
  const yOffset = reduce ? 0 : y;
  const dur = reduce ? 0 : 0.45;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: yOffset },
        visible: { opacity: 1, y: 0, transition: { duration: dur, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}
