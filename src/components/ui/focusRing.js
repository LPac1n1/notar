/**
 * Foco dos controles de formulário (input, textarea, select).
 *
 * Antes cada um combinava `focus:border-[var(--accent)]` COM um
 * `focus-visible:ring-2 ... ring-offset-2`. O anel deslocado desenha uma
 * segunda linha azul separada da borda, então o campo focado aparecia com
 * duas bordas azuis concêntricas.
 *
 * Aqui a borda muda de cor e o anel de 1px encosta nela (sem offset), então
 * os dois se somam numa única borda de ~2px — indicador de foco continua
 * bem visível para quem navega por teclado, sem o efeito de moldura dupla.
 */
export const FOCUS_RING =
  "focus:border-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]";
