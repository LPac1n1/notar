import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "notar-hidden-values";

/**
 * Os valores dos painéis começam ESCONDIDOS.
 *
 * O painel abre com nomes de doadores, CPFs e cifras à vista. Quem usa o
 * sistema com alguém por perto — ou compartilhando tela — precisa poder abrir a
 * página sem expor isso antes de decidir. Começar escondido e lembrar da última
 * escolha inverte o ônus para o lado seguro: mostrar é um ato deliberado.
 */
const DEFAULT_HIDDEN = true;

function readStored() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_HIDDEN : stored === "1";
  } catch {
    // Navegador com armazenamento bloqueado: a preferência não persiste, mas a
    // tela continua funcionando — e no lado seguro.
    return DEFAULT_HIDDEN;
  }
}

/**
 * Estado fora do React, com assinantes.
 *
 * O botão e o conteúdo que ele controla são componentes distintos, às vezes em
 * ramos diferentes da árvore. Com `useState` em cada um, clicar no botão
 * mudaria só o dele. Um contexto resolveria, mas exigiria um provedor
 * envolvendo cada painel — e este estado não tem nada de específico de uma
 * árvore: é uma preferência do usuário, como o tema.
 *
 * A leitura passa por `useSyncExternalStore`, que é a API feita para loja
 * externa: ela assina, lê o valor atual no próprio render e dispensa o efeito
 * de sincronização que um `useState` exigiria.
 */
let hiddenValues = readStored();
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return hiddenValues;
}

function setHiddenValues(next) {
  if (next === hiddenValues) {
    return;
  }

  hiddenValues = next;

  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Sem persistência, a escolha vale só para esta sessão.
  }

  for (const listener of listeners) {
    listener();
  }
}

/**
 * Devolve se os valores estão escondidos e o alternador.
 *
 * `attributes` vai no elemento que embrulha o conteúdo sensível: é o gancho
 * que o CSS usa para desfocar tudo que estiver marcado como valor lá dentro,
 * em vez de cada número decidir sozinho se deve aparecer.
 */
export function useHiddenValues() {
  const isHidden = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggle = useCallback(() => {
    setHiddenValues(!hiddenValues);
  }, []);

  return {
    isHidden,
    toggle,
    attributes: { "data-values-hidden": isHidden ? "true" : "false" },
  };
}
