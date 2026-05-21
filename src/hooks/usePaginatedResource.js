import { useCallback, useMemo, useState } from "react";
import { useDataResource } from "./useDataResource";

/**
 * Combines `useDataResource` with server-side pagination state.
 * Requires `countLoader` to be set — it runs `COUNT(*)` for the same filters
 * (without `limit`/`offset`) so `PaginationControls` can display total pages.
 *
 * The `pagination` object returned has the same shape as `usePagination` so
 * `PaginationControls` works without changes.
 *
 * Page resets to 1 automatically when `filters` reference changes (i.e. when
 * the user edits a filter field), but not when `page`/`pageSize` themselves
 * change.
 */
export function usePaginatedResource({
  loader,
  countLoader,
  filters,
  initialPage = 1,
  initialPageSize = 25,
  ...rest
}) {
  const [paginationState, setPaginationState] = useState(() => ({
    filters,
    page: initialPage,
    pageSize: initialPageSize,
  }));
  const pageSize = paginationState.pageSize;
  const page = paginationState.filters === filters ? paginationState.page : 1;

  const pagedFilters = useMemo(
    () => ({ ...filters, limit: pageSize, offset: (page - 1) * pageSize }),
    [filters, page, pageSize],
  );

  const resource = useDataResource({ loader, countLoader, filters: pagedFilters, ...rest });

  const totalCount = resource.totalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // Don't clamp page until totalCount is known — avoids resetting a restored
  // page (e.g. from location state) before the first load completes.
  const currentPage = totalCount > 0 ? Math.min(Math.max(page, 1), totalPages) : page;
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalCount, currentPage * pageSize);

  const handlePageSizeChange = useCallback((event) => {
    setPaginationState((current) => ({
      ...current,
      filters,
      page: 1,
      pageSize: Number(event.target.value) || initialPageSize,
    }));
  }, [filters, initialPageSize]);

  const setPage = useCallback(
    (nextPage) => {
      setPaginationState((current) => {
        const currentPage = current.filters === filters ? current.page : 1;
        const resolved =
          typeof nextPage === "function" ? nextPage(currentPage) : nextPage;
        return {
          ...current,
          filters,
          page: Math.min(
            Math.max(Number(resolved) || 1, 1),
            Math.max(1, totalPages),
          ),
        };
      });
    },
    [filters, totalPages],
  );

  return {
    ...resource,
    pagination: {
      endItem,
      handlePageSizeChange,
      page: currentPage,
      pageSize,
      setPage,
      startItem,
      totalItems: totalCount,
      totalPages,
    },
  };
}
