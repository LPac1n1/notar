import { Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";

export default function NotFound() {
  return (
    <div>
      <PageHeader
        title="Página não encontrada"
        subtitle="O endereço acessado não existe no sistema."
        className="mb-6"
      />
      <Link
        to="/"
        className="text-sm text-[var(--accent)] underline-offset-4 hover:underline"
      >
        Voltar para o início
      </Link>
    </div>
  );
}
