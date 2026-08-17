import { useCallback } from "react";
import { useNavigationProject } from "./useProject";

/**
 * Monta caminhos dentro do projeto ativo.
 *
 * Existe para que nenhuma página precise saber o formato do prefixo. Se a
 * rota mudar de `/p/:slug` para outra coisa, muda aqui e em nenhum outro
 * lugar — e páginas que hoje escrevem `/doadores` na mão não voltam a
 * escapar do ambiente do projeto sem ninguém notar.
 *
 * Fora de um projeto (Importações, Configurações) devolve o caminho de
 * plataforma, porque ali não há projeto a prefixar.
 */
export function useProjectPath() {
  const project = useNavigationProject();
  const slug = project?.slug ?? "";

  return useCallback(
    (path = "") => {
      const normalized = String(path).replace(/^\//, "");

      if (!slug) {
        return `/${normalized}`;
      }

      return normalized ? `/p/${slug}/${normalized}` : `/p/${slug}`;
    },
    [slug],
  );
}
