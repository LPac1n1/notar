import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";

export default function Settings() {
  return (
    <div>
      <PageHeader title="Configurações" className="mb-4" />
      <EmptyState
        title="Nenhuma configuração disponível por enquanto"
        description="As configurações do sistema aparecerão aqui conforme os próximos módulos forem implementados."
      />
    </div>
  );
}
