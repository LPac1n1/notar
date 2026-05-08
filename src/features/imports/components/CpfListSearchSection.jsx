import { useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import CopyButton from "../../../components/ui/CopyButton";
import CopyableValue from "../../../components/ui/CopyableValue";
import EmptyState from "../../../components/ui/EmptyState";
import FeedbackMessage from "../../../components/ui/FeedbackMessage";
import PaginationControls from "../../../components/ui/PaginationControls";
import SectionCard from "../../../components/ui/SectionCard";
import StatusBadge from "../../../components/ui/StatusBadge";
import { SearchIcon } from "../../../components/ui/icons";
import { usePagination } from "../../../hooks/usePagination";
import { searchImportedCpfs } from "../../../services/importService";
import { formatCpf, parseCpfList } from "../../../utils/cpf";
import { formatMonthYear } from "../../../utils/date";
import { getErrorMessage } from "../../../utils/error";
import { formatInteger } from "../../../utils/format";

const GROUP_DEFINITIONS = [
  {
    key: "registeredWithDonations",
    title: "Doaram e estão cadastrados",
    description: "CPFs encontrados nas importações já vinculados a um doador.",
    tone: "success",
    showDonations: true,
  },
  {
    key: "unregisteredWithDonations",
    title: "Doaram e não estão cadastrados",
    description: "CPFs encontrados nas importações sem cadastro como doador.",
    tone: "warning",
    showDonations: true,
  },
  {
    key: "registeredWithoutDonations",
    title: "Cadastrados, mas sem doações encontradas",
    description: "CPFs já vinculados a um doador, sem registros nas importações.",
    tone: "info",
    showDonations: false,
  },
  {
    key: "unregisteredWithoutDonations",
    title: "Não doaram e não estão cadastrados",
    description: "CPFs informados que não aparecem em nenhuma importação nem no cadastro.",
    tone: "neutral",
    showDonations: false,
  },
];

function CpfResultRow({ entry, showDonations, onOpenDonorProfile }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CopyableValue copyLabel="Copiar CPF" value={formatCpf(entry.cpf)}>
          <span className="font-semibold text-[var(--text-main)]">
            {formatCpf(entry.cpf)}
          </span>
        </CopyableValue>
        {entry.isRegistered && entry.isActiveDonor === false ? (
          <StatusBadge status="inactive" />
        ) : null}
      </div>

      {entry.donorName || entry.sourceName ? (
        <div className="mt-2">
          {entry.donorId ? (
            <CopyableValue
              copyLabel="Copiar nome"
              value={entry.donorName || entry.sourceName}
            >
              <button
                type="button"
                onClick={() => onOpenDonorProfile?.(entry.donorId)}
                className="text-left text-sm font-medium text-[var(--text-soft)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline"
              >
                {entry.donorName || entry.sourceName}
              </button>
            </CopyableValue>
          ) : (
            <CopyableValue
              copyLabel="Copiar nome"
              value={entry.donorName || entry.sourceName}
            >
              <span className="text-sm font-medium text-[var(--text-soft)]">
                {entry.donorName || entry.sourceName}
              </span>
            </CopyableValue>
          )}
        </div>
      ) : null}

      {showDonations ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--muted)]">
          <span>
            <span className="font-medium text-[var(--text-main)]">
              {formatInteger(entry.totalDonations)}
            </span>{" "}
            {entry.totalDonations === 1 ? "doação" : "doações"}
          </span>
          <span>
            <span className="font-medium text-[var(--text-main)]">
              {formatInteger(entry.months.length)}
            </span>{" "}
            {entry.months.length === 1 ? "mês" : "meses"}
          </span>
        </div>
      ) : null}

      {showDonations && entry.months.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.months.map((month) => (
            <span
              key={month.referenceMonth}
              className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--text-soft)]"
            >
              {formatMonthYear(`${month.referenceMonth}-01`)}
              <span className="ml-1.5 font-semibold text-[var(--text-main)]">
                {formatInteger(month.count)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResultGroup({ definition, items, onOpenDonorProfile }) {
  const pagination = usePagination(items, { initialPageSize: 10 });
  const shouldShowPagination = items.length > 10;
  const copyValue = useMemo(
    () => items.map((entry) => formatCpf(entry.cpf)).join("\n"),
    [items],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="space-y-3"
      data-testid={`cpf-list-result-${definition.key}`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={`${formatInteger(items.length)} CPF(s)`}
              tone={definition.tone}
            />
            <h3 className="font-[var(--font-display)] text-base font-bold text-[var(--text-main)]">
              {definition.title}
            </h3>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {definition.description}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1.5 text-xs font-medium text-[var(--muted-strong)]">
          <span>Copiar todos os CPFs</span>
          <CopyButton
            label={`Copiar todos os CPFs de ${definition.title}`}
            value={copyValue}
          />
        </div>
      </div>

      {shouldShowPagination ? (
        <PaginationControls
          className="bg-[var(--surface-strong)]"
          endItem={pagination.endItem}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.handlePageSizeChange}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
        />
      ) : null}

      <div className="space-y-2">
        {pagination.visibleItems.map((entry) => (
          <CpfResultRow
            key={entry.cpf}
            entry={entry}
            showDonations={definition.showDonations}
            onOpenDonorProfile={onOpenDonorProfile}
          />
        ))}
      </div>

      {shouldShowPagination && pagination.totalPages > 1 ? (
        <PaginationControls
          className="bg-[var(--surface-strong)]"
          endItem={pagination.endItem}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.handlePageSizeChange}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
        />
      ) : null}
    </div>
  );
}

export default function CpfListSearchSection({ onOpenDonorProfile }) {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const tokens = parseCpfList(inputText);
  const hasInput = tokens.length > 0;

  const totalResultCount = results
    ? results.registeredWithDonations.length +
      results.unregisteredWithDonations.length +
      results.registeredWithoutDonations.length +
      results.unregisteredWithoutDonations.length
    : 0;

  const totalDonationsFound = results
    ? [
        ...results.registeredWithDonations,
        ...results.unregisteredWithDonations,
      ].reduce((sum, entry) => sum + entry.totalDonations, 0)
    : 0;

  const handleSearch = async () => {
    if (!hasInput) {
      setError("Cole ou digite ao menos um CPF para iniciar a busca.");
      return;
    }

    try {
      setError("");
      setIsSearching(true);
      const data = await searchImportedCpfs(tokens);
      setResults(data);
    } catch (err) {
      console.error(
        "Erro ao buscar CPFs nas importações:",
        getErrorMessage(err, "Erro desconhecido."),
      );
      setError(
        getErrorMessage(err, "Não foi possível buscar a lista de CPFs nas importações."),
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setInputText("");
    setResults(null);
    setError("");
  };

  return (
    <SectionCard className="mb-5">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--text-main)]">
            Busca por lista de CPFs
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Cole uma lista de CPFs (um por linha, separados por vírgula ou espaço) para
            classificá-los entre cadastrados, não cadastrados, com e sem doações.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            variant="subtle"
            onClick={handleClear}
            disabled={isSearching || (!hasInput && !results)}
          >
            Limpar lista
          </Button>
          <Button
            onClick={handleSearch}
            disabled={!hasInput || isSearching}
            isLoading={isSearching}
            loadingLabel="Buscando..."
            leftIcon={<SearchIcon className="h-4 w-4" />}
          >
            Buscar CPFs
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="cpf-list-input"
          className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
        >
          Lista de CPFs
        </label>
        <textarea
          id="cpf-list-input"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          rows={6}
          placeholder={"123.456.789-00\n987.654.321-00\n..."}
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 font-mono text-sm text-[var(--text-main)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-[var(--surface-muted)]"
        />
      </div>

      {hasInput || results ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          {results ? (
            <>
              <span className="font-semibold text-[var(--text-main)]">
                {formatInteger(results.stats.validCount)}
              </span>{" "}
              CPF(s) válido(s) consultado(s)
              {results.stats.duplicateCount > 0 ? (
                <>
                  {" • "}
                  <span className="font-semibold text-[var(--text-main)]">
                    {formatInteger(results.stats.duplicateCount)}
                  </span>{" "}
                  duplicado(s) ignorado(s)
                </>
              ) : null}
              {results.stats.invalidCount > 0 ? (
                <>
                  {" • "}
                  <span className="font-semibold text-[var(--warning)]">
                    {formatInteger(results.stats.invalidCount)}
                  </span>{" "}
                  inválido(s) ignorado(s)
                </>
              ) : null}
              {totalDonationsFound > 0 ? (
                <>
                  {" • Total de "}
                  <span className="font-semibold text-[var(--text-main)]">
                    {formatInteger(totalDonationsFound)}
                  </span>{" "}
                  doação(ões) encontrada(s)
                </>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-semibold text-[var(--text-main)]">
                {formatInteger(tokens.length)}
              </span>{" "}
              token(s) prontos para busca
            </>
          )}
        </p>
      ) : null}

      <FeedbackMessage message={error} tone="error" />

      {results ? (
        totalResultCount === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="Nenhum CPF válido encontrado"
              description="Verifique se os CPFs informados possuem 11 dígitos e tente novamente."
            />
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {GROUP_DEFINITIONS.map((definition) => (
              <ResultGroup
                key={definition.key}
                definition={definition}
                items={results[definition.key] ?? []}
                onOpenDonorProfile={onOpenDonorProfile}
              />
            ))}
          </div>
        )
      ) : null}
    </SectionCard>
  );
}
