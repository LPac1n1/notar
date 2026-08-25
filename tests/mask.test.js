import test from "node:test";
import assert from "node:assert/strict";
import { maskCpf, maskName } from "../src/utils/mask.js";

test("o CPF esconde os três primeiros dígitos e os dois últimos", () => {
  assert.equal(maskCpf("52998224725"), "***.982.247-**");
  // Aceita já formatado — a máscara trabalha sobre os dígitos.
  assert.equal(maskCpf("529.982.247-25"), "***.982.247-**");
});

test("CPF fora do padrão some por inteiro em vez de vazar um pedaço", () => {
  // Um valor truncado ou sujo não pode ser mascarado "pela metade": o que
  // sobrasse seria justamente a parte que a regra não previu.
  assert.equal(maskCpf("123"), "***.***.***-**");
  assert.equal(maskCpf(""), "***.***.***-**");
  assert.equal(maskCpf(null), "***.***.***-**");
});

test("o nome mantém o primeiro inteiro e abrevia os sobrenomes", () => {
  assert.equal(maskName("MARIA APARECIDA DA SILVA"), "MARIA A. DA S.");
  assert.equal(maskName("BRUNO SILVA"), "BRUNO S.");
});

test("as partículas ficam como estão", () => {
  // Abreviar "da"/"de"/"dos" não esconde nada e só deixaria o nome ilegível.
  // Saem em maiúscula porque é assim que o nome é gravado — a máscara não
  // reescreve o que decidiu preservar.
  assert.equal(maskName("JOAO DOS SANTOS DE OLIVEIRA"), "JOAO DOS S. DE O.");
});

test("nome de uma palavra só continua inteiro", () => {
  // Não há sobrenome para abreviar; devolver "M." esconderia a única coisa
  // que permite a pessoa se reconhecer na lista.
  assert.equal(maskName("MADONNA"), "MADONNA");
});

test("nome vazio não vira pontuação solta", () => {
  assert.equal(maskName(""), "");
  assert.equal(maskName("   "), "");
  assert.equal(maskName(null), "");
});
