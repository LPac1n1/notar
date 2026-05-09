import { motion as Motion, useReducedMotion } from "framer-motion";

export default function PageTransition({ children }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{
        duration: shouldReduceMotion ? 0.08 : 0.18,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </Motion.div>
  );
}
