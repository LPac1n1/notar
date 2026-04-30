import PaginationControls from "../../../components/ui/PaginationControls";
import {
  MonthlyIcon,
  WarningIcon,
} from "../../../components/ui/icons";
import { formatInteger } from "../../../utils/format";
import GroupSection from "./GroupSection";
import MonthlySummaryRow from "./MonthlySummaryRow";

export default function MonthlySummaryList({
  pagination,
  donatedSummaries,
  notDonatedSummaries,
  updatingSummaryId,
  onNavigate,
  onStatusChange,
  showReferenceMonth,
}) {
  const paginationProps = {
    endItem: pagination.endItem,
    onPageChange: pagination.setPage,
    onPageSizeChange: pagination.handlePageSizeChange,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
  };

  return (
    <div className="space-y-5">
      <PaginationControls {...paginationProps} />

      {donatedSummaries.length > 0 ? (
        <GroupSection
          icon={<MonthlyIcon className="h-4 w-4" />}
          title="Com doação no mês"
          description="Abatimentos gerados a partir das notas conciliadas no período."
          countLabel={`${formatInteger(donatedSummaries.length)} nesta página`}
          tone="success"
        >
          {donatedSummaries.map((summary) => (
            <MonthlySummaryRow
              key={summary.id}
              summary={summary}
              isUpdating={updatingSummaryId === summary.id}
              onNavigate={onNavigate}
              onStatusChange={onStatusChange}
              showReferenceMonth={showReferenceMonth}
            />
          ))}
        </GroupSection>
      ) : null}

      {notDonatedSummaries.length > 0 ? (
        <GroupSection
          icon={<WarningIcon className="h-4 w-4" />}
          title="Sem doação no mês"
          description="Doadores ativos que seguem visíveis para acompanhamento, mesmo sem notas no período."
          countLabel={`${formatInteger(notDonatedSummaries.length)} nesta página`}
          tone="warning"
        >
          {notDonatedSummaries.map((summary) => (
            <MonthlySummaryRow
              key={summary.id}
              summary={summary}
              isUpdating={updatingSummaryId === summary.id}
              onNavigate={onNavigate}
              onStatusChange={onStatusChange}
              showReferenceMonth={showReferenceMonth}
            />
          ))}
        </GroupSection>
      ) : null}

      <PaginationControls {...paginationProps} />
    </div>
  );
}
