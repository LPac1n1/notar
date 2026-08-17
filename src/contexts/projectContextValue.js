import { createContext } from "react";

// createContext isolado num .js porque o Fast Refresh exige que um .jsx
// exporte apenas componentes — mesma separação de `authContextValue.js`.
//
// Um contexto só: a lista de projetos e qual está aberto são resolvidos no
// mesmo lugar (`ProjectProvider`), acima do Layout, porque a barra lateral
// precisa do projeto ativo tanto quanto as páginas.
export const ProjectContext = createContext(null);
