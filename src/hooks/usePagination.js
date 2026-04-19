import { useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function usePagination(items, { initialPageSize = 25 } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const visibleItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [currentPage, items, pageSize]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  const handlePageSizeChange = (event) => {
    setPageSize(Number(event.target.value));
    setPage(1);
  };

  return {
    endItem,
    handlePageSizeChange,
    page: currentPage,
    pageSize,
    setPage,
    startItem,
    totalItems,
    totalPages,
    visibleItems,
  };
}
