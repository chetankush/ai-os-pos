'use client';

import { motion, type HTMLMotionProps, type Transition } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE: Transition['ease'] = [0.22, 1, 0.36, 1];

interface FadeInProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  delay?: number;
  duration?: number;
  y?: number;
  children?: ReactNode;
}

export function FadeIn({ delay = 0, duration = 0.4, y = 8, children, ...rest }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: EASE }}
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
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
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
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}
