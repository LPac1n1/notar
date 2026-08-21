import { Fragment } from "react";

/**
 * Texto de apoio em que só os NÚMEROS somem quando os valores estão ocultos.
 *
 * O modo de ocultar troca cada caractere por uma bolinha. Aplicado à frase
 * inteira, "2 de 2 doador(es) cadastrado(s) doaram." virava uma fileira de
 * pontinhos que não dizia mais nada — o cartão perdia o rótulo junto com o
 * valor. Marcando só os trechos numéricos, a frase continua legível e o que
 * ela informava fica coberto: "• de • doador(es) cadastrado(s) doaram."
 *
 * A separação é feita aqui, e não em cada chamador, porque o texto de apoio
 * chega pronto de dezenas de lugares como uma string só.
 */

// Um número e o que anda colado nele: separador de milhar, decimal e o sinal
// de porcentagem. `R$` fica de fora de propósito — dizer que o valor é dinheiro
// não revela quanto, e some-lo deixaria a frase truncada.
const VALUE_PATTERN = /(\d[\d.,]*%?)/g;

export default function TextWithValues({ text }) {
  const content = String(text ?? "");

  if (!content) {
    return null;
  }

  // `split` com grupo de captura devolve os trechos capturados nas posições
  // ÍMPARES. Usar a posição, e não um `test()` sobre cada pedaço, evita a
  // armadilha do regex global: `test` avança `lastIndex` a cada chamada e
  // passaria a errar do segundo número em diante.
  const parts = content.split(VALUE_PATTERN);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="numeric">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
