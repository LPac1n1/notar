import Button from "../../../components/ui/Button";
import {
  DownloadIcon,
  FileIcon,
} from "../../../components/ui/icons";
import OverviewMetric from "./OverviewMetric";

export default function MonthlySummaryToolbar({
  metrics,
  onClearRefinements,
  onExportCsv,
  onExportPdf,
  isExportingCsv,
  isExportingPdf,
  isPdfDisabled,
}) {
  return (
    <div className="mb-5 grid gap-4">
      <div className={`grid gap-3 ${metrics.length > 2 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"}`}>
        {metrics.map((metric) => (
          <OverviewMetric
            key={metric.label}
            icon={metric.icon}
            label={metric.label}
            value={metric.value}
            helper={metric.helper}
            tone={metric.tone}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="subtle"
          onClick={onClearRefinements}
        >
          Limpar refinamentos
        </Button>
        <Button
          variant="subtle"
          onClick={onExportCsv}
          disabled={isExportingCsv}
          isLoading={isExportingCsv}
          loadingLabel="Exportando..."
          leftIcon={<DownloadIcon className="h-4 w-4" />}
        >
          Exportar CSV
        </Button>
        <Button
          variant="subtle"
          onClick={onExportPdf}
          disabled={isExportingPdf || isPdfDisabled}
          isLoading={isExportingPdf}
          loadingLabel="Gerando PDF..."
          leftIcon={<FileIcon className="h-4 w-4" />}
        >
          PDFs por demanda
        </Button>
      </div>
    </div>
  );
}
