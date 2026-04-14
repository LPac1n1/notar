import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";

export default function Dashboard() {
  return (
    <div>
      <PageHeader title="Dashboard" className="mb-4" />
      <EmptyState
        title="Ainda não há dados suficientes para o dashboard"
        description="Cadastre doadores, demandas e importe uma planilha para começar a visualizar os indicadores gerais."
      />
    </div>
  );
}
