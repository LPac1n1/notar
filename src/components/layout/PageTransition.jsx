import { motion as Motion, useReducedMotion } from "framer-motion";

/**
 * A animação de troca de página — só na ENTRADA, de propósito.
 *
 * Havia também uma animação de saída, orquestrada por `AnimatePresence` em
 * `mode="wait"`. Nesse modo o filho novo só monta depois de o antigo terminar
 * de sair, e como o `<Routes>` vive DENTRO do filho animado, isso colocava a
 * saída do rotepiador atrás de uma animação. Bastava navegar de novo dentro da
 * janela de 180ms — clicar rápido, ou um `<Navigate>` de redirecionamento
 * disparar — para o `AnimatePresence` ficar preso no filho que estava saindo:
 * a URL continuava mudando e a tela ficava congelada na página anterior, com
 * todos os botões de navegação aparentemente mortos.
 *
 * Sem saída não há o que esperar: a troca de `key` remonta o conteúdo na hora
 * e a animação de entrada roda por cima. O ganho visual percebido é o mesmo —
 * o que se nota numa troca de página é a entrada — e a navegação deixa de
 * depender de uma animação terminar para funcionar.
 */
export default function PageTransition({ children }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0.08 : 0.18,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </Motion.div>
  );
}
