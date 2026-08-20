import { useEffect, useRef, useState } from "react";
import { findFirstDonationMonthForCpf } from "../../../services/donor/donationStart";
import { logError } from "../../../services/logger";
import { normalizeCpf } from "../../../utils/cpf";

const DEBOUNCE_MS = 400;

/**
 * Descobre o início das doações enquanto o CPF é digitado.
 *
 * A informação já está nas planilhas importadas; pedir que alguém a procure e
 * redigite é trabalho que o sistema faz melhor — tanto que o painel mantém um
 * cartão inteiro só para cobrar "doadores sem início". A busca dispara
 * sozinha, sem botão: o usuário vê o campo preencher.
 *
 * Três cuidados definem o comportamento:
 *
 * 1. Preenche UMA vez por CPF. Se a pessoa apagar a data preenchida, ela fica
 *    apagada — reescrever seria discutir com quem está usando o sistema.
 * 2. Nunca escreve por cima de data já preenchida, venha do usuário ou de uma
 *    descoberta anterior.
 * 3. Descarta resposta atrasada. Digitar um CPF dispara várias buscas, e sem
 *    o corte a resposta de um prefixo poderia chegar por último e preencher a
 *    data de outra pessoa.
 *
 * O estado exposto é DERIVADO do CPF atual em vez de zerado por efeito: apagar
 * um dígito volta a "idle" no mesmo render, sem passar por um render
 * intermediário exibindo a mensagem do CPF anterior.
 */
export function useDonationStartDiscovery({
  cpf,
  currentStartDate,
  enabled = true,
  onDiscover,
}) {
  const [result, setResult] = useState({ cpf: "", status: "idle" });
  const requestIdRef = useRef(0);
  const settledCpfRef = useRef("");
  // Em ref para o efeito de busca não reiniciar a cada tecla em outro campo.
  const onDiscoverRef = useRef(onDiscover);
  const currentStartDateRef = useRef(currentStartDate);

  useEffect(() => {
    onDiscoverRef.current = onDiscover;
    currentStartDateRef.current = currentStartDate;
  });

  const normalizedCpf = normalizeCpf(cpf);
  const isEligible = enabled && normalizedCpf.length === 11;

  useEffect(() => {
    if (!isEligible || settledCpfRef.current === normalizedCpf) {
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timer = setTimeout(async () => {
      setResult({ cpf: normalizedCpf, status: "searching" });

      try {
        const month = await findFirstDonationMonthForCpf(normalizedCpf);

        if (requestIdRef.current !== requestId) {
          return;
        }

        settledCpfRef.current = normalizedCpf;
        setResult({
          cpf: normalizedCpf,
          status: month ? "found" : "not-found",
        });

        if (month && !currentStartDateRef.current) {
          // O formulário guarda AAAA-MM, que é o formato que o campo de mês
          // emite quando digitado à mão; a consulta devolve o primeiro dia.
          onDiscoverRef.current?.(month.slice(0, 7));
        }
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        // Falhar aqui não pode atrapalhar o cadastro: sem a descoberta o campo
        // continua vazio, que é exatamente o comportamento de antes.
        logError("useDonationStartDiscovery", error, { cpf: normalizedCpf });
        settledCpfRef.current = normalizedCpf;
        setResult({ cpf: normalizedCpf, status: "idle" });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isEligible, normalizedCpf]);

  return {
    status: isEligible && result.cpf === normalizedCpf ? result.status : "idle",
  };
}

/** Texto de apoio do campo, para o usuário saber de onde a data veio. */
export function describeDonationStartDiscovery(status) {
  if (status === "searching") {
    return "Procurando este CPF nas planilhas importadas...";
  }

  if (status === "found") {
    return "Preenchido com o primeiro mês em que este CPF aparece nas planilhas.";
  }

  if (status === "not-found") {
    return "Este CPF ainda não aparece em nenhuma planilha importada.";
  }

  return "";
}
