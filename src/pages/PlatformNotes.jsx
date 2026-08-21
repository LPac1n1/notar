import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import NoteAnalyticsExplorer from "../features/notesAnalytics/components/NoteAnalyticsExplorer";

/**
 * Notas fiscais de toda a plataforma.
 *
 * Página própria, e não mais uma seção do painel: aqui há filtros em duas
 * linhas, ordenação por coluna, paginação e exportação. Empilhar isso embaixo
 * do painel obrigaria a rolar por tudo antes de chegar à ferramenta, e o
 * painel existe para responder rápido — não para investigar.
 *
 * O recorte é o sistema inteiro, sem projeto travado: o projeto é só mais um
 * filtro. É o que permite comparar projetos entre si, coisa que nenhum painel
 * de projeto consegue fazer por definição.
 */
export default function PlatformNotes() {
  return (
    <div>
      <PageHeader
        title="Notas fiscais"
        subtitle="Cada nota importada, de todos os projetos e doadores, com o crédito que gerou."
        className="mb-6"
      />

      <SectionCard
        title="Explorar notas"
        description="Filtre, ordene e exporte. Os indicadores acompanham o recorte aplicado."
      >
        <NoteAnalyticsExplorer exportPrefix="notas-fiscais" />
      </SectionCard>
    </div>
  );
}
