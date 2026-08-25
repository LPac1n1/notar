import { normalizeCpf } from "./cpf.js";

/**
 * Máscaras para a lista de sorteio, que é feita para ser exibida em público.
 *
 * O objetivo é o participante se reconhecer sem que a lista entregue o dado
 * de terceiros a quem estiver olhando. Por isso o que sobra é o suficiente
 * para alguém confirmar "sou eu", e não para identificar um desconhecido.
 */

/**
 * CPF no formato que órgãos públicos brasileiros usam para divulgação:
 * escondem os três primeiros dígitos e os dois últimos.
 *
 *   52998224725  ->  ***.982.247-**
 *
 * Os seis dígitos do meio bastam para a pessoa se reconhecer e são poucos
 * demais para reconstruir o CPF: faltam cinco dígitos, e o verificador (os
 * dois últimos) fica coberto justamente porque é derivável dos demais.
 */
export function maskCpf(value) {
  const digits = normalizeCpf(value);

  if (digits.length !== 11) {
    // CPF fora do padrão não é mascarado pela metade — some por inteiro, em
    // vez de vazar uma parte por não caber na regra.
    return "***.***.***-**";
  }

  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/**
 * Nome com os sobrenomes reduzidos a inicial.
 *
 *   MARIA APARECIDA DA SILVA  ->  MARIA A. da S.
 *
 * O primeiro nome fica inteiro porque é ele que faz a pessoa se reconhecer na
 * lista. As partículas ("da", "de", "dos") ficam como estão: abreviá-las não
 * esconde nada e só deixaria o nome ilegível.
 */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

export function maskName(value) {
  const partes = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (partes.length === 0) {
    return "";
  }

  const [primeiro, ...resto] = partes;

  const abreviado = resto.map((parte) => {
    if (PARTICULAS.has(parte.toLowerCase())) {
      return parte;
    }

    return `${parte[0].toUpperCase()}.`;
  });

  return [primeiro, ...abreviado].join(" ");
}
