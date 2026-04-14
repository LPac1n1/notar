import { useCallback, useEffect, useState } from "react";
import FeedbackMessage from "../components/ui/FeedbackMessage";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import SelectInput from "../components/ui/SelectInput";
import TextInput from "../components/ui/TextInput";
import {
  listImportCpfSummary,
  listImports,
} from "../services/importService";

export default function Imports() {
  const [imports, setImports] = useState([]);
  const [cpfSummary, setCpfSummary] = useState([]);
  const [importFilters, setImportFilters] = useState({
    fileName: "",
    referenceMonth: "",
    status: "",
  });
  const [cpfFilters, setCpfFilters] = useState({
    importId: "",
    referenceMonth: "",
    cpf: "",
    donorName: "",
    demand: "",
    registrationFilter: "all",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [importRows, cpfRows] = await Promise.all([
        listImports(importFilters),
        listImportCpfSummary(cpfFilters),
      ]);
      setImports(importRows);
      setCpfSummary(cpfRows);
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel carregar os dados de importacao.");
    } finally {
      setIsLoading(false);
    }
  }, [cpfFilters, importFilters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleImportFilterChange = (event) => {
    const { name, value } = event.target;
    setImportFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleCpfFilterChange = (event) => {
    const { name, value } = event.target;
    setCpfFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  return (
    <div>
      <PageHeader title="Importações" className="mb-4" />
      <FeedbackMessage message={isLoading ? "Carregando importações..." : ""} />
      <FeedbackMessage message={error} tone="error" />

      <SectionCard title="Histórico de importações" className="mb-8">

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <TextInput
            type="text"
            name="fileName"
            placeholder="Filtrar por arquivo"
            value={importFilters.fileName}
            onChange={handleImportFilterChange}
          />

          <TextInput
            type="month"
            name="referenceMonth"
            value={importFilters.referenceMonth}
            onChange={handleImportFilterChange}
          />

          <SelectInput
            name="status"
            value={importFilters.status}
            onChange={handleImportFilterChange}
          >
            <option value="">Todos os status</option>
            <option value="processed">Processadas</option>
            <option value="pending">Pendentes</option>
          </SelectInput>
        </div>

        {imports.length === 0 ? (
          <EmptyState
            title="Nenhuma importação cadastrada"
            description="Quando você importar uma planilha da Nota Fiscal Paulista, o histórico aparecerá aqui."
          />
        ) : (
          <div className="space-y-3">
            {imports.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-lg border border-zinc-200 p-4 md:grid-cols-5"
              >
                <div>
                  <p className="text-sm text-zinc-500">Arquivo</p>
                  <p className="font-medium">{item.fileName}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Mês</p>
                  <p className="font-medium">{item.referenceMonth}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Linhas</p>
                  <p className="font-medium">{item.totalRows}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Linhas compatíveis</p>
                  <p className="font-medium">{item.matchedRows}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Doadores encontrados</p>
                  <p className="font-medium">{item.matchedDonors}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="CPFs encontrados">

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SelectInput
            name="importId"
            value={cpfFilters.importId}
            onChange={handleCpfFilterChange}
          >
            <option value="">Todas as importações</option>
            {imports.map((item) => (
              <option key={item.id} value={item.id}>
                {item.referenceMonth} - {item.fileName}
              </option>
            ))}
          </SelectInput>

          <TextInput
            type="month"
            name="referenceMonth"
            value={cpfFilters.referenceMonth}
            onChange={handleCpfFilterChange}
          />

          <SelectInput
            name="registrationFilter"
            value={cpfFilters.registrationFilter}
            onChange={handleCpfFilterChange}
          >
            <option value="all">Todos</option>
            <option value="registered">Somente cadastrados</option>
            <option value="unregistered">Somente não cadastrados</option>
          </SelectInput>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <TextInput
            type="text"
            name="cpf"
            placeholder="Filtrar por CPF"
            value={cpfFilters.cpf}
            onChange={handleCpfFilterChange}
          />

          <TextInput
            type="text"
            name="donorName"
            placeholder="Filtrar por nome do doador"
            value={cpfFilters.donorName}
            onChange={handleCpfFilterChange}
          />

          <TextInput
            type="text"
            name="demand"
            placeholder="Filtrar por demanda"
            value={cpfFilters.demand}
            onChange={handleCpfFilterChange}
          />
        </div>

        {cpfSummary.length === 0 ? (
          <EmptyState
            title="Nenhum CPF encontrado"
            description="Os CPFs identificados nas importações aparecerão aqui, junto com a indicação de cadastro no sistema."
          />
        ) : (
          <div className="space-y-3">
            {cpfSummary.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded-lg border border-zinc-200 p-4 md:grid-cols-[1fr_120px_160px_1fr]"
              >
                <div>
                  <p className="font-medium">{item.cpf}</p>
                  <p className="text-sm text-zinc-600">
                    {item.donorName || "CPF ainda nao cadastrado"}
                  </p>
                  <p className="text-sm text-zinc-600">
                    Demanda: {item.demand || "Nao informada"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Notas</p>
                  <p className="font-medium">{item.notesCount}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Status</p>
                  <p className="font-medium">
                    {item.isRegisteredDonor ? "Cadastrado" : "Nao cadastrado"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Mês</p>
                  <p className="font-medium">{item.referenceMonth}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
