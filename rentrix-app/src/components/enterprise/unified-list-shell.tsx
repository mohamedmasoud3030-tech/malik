/**
 * UnifiedListShell — single visual language for every list page.
 * Replaces fragmented per-page scaffolds (ListPage + EmbeddableWorkspace + Card headers + EntityTable variations)
 * with one practical, dense, non-marketing shell:
 *  - compact header (title + count, one-line description)
 *  - one filter/search band
 *  - one EnterpriseDataTable (compact)
 * No per-page duplicate code, no different card shadows, no marketing copy.
 */
import type { ReactNode } from 'react';
import { EnterprisePage } from './enterprise-page';
import { EnterpriseDataTable, type EnterpriseColumnDef } from './enterprise-data-table';
import { EnterpriseEmptyState } from './enterprise-empty-state';

export type UnifiedListShellProps<T> = {
  title: string;
  description?: string;
  count?: number;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  rows: T[];
  columns: EnterpriseColumnDef<T>[];
  keyOf: (row: T) => string;
  ariaLabel: string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => import('./enterprise-row-actions').EnterpriseRowActionItem[];
  renderMobileCard?: (row: T, index: number) => ReactNode;
  pagination?: import('./enterprise-data-table').EnterpriseTablePagination;
};

export function UnifiedListShell<T>(props: UnifiedListShellProps<T>) {
  const {
    title, description, count, primaryAction, secondaryActions,
    searchValue, onSearchChange, searchPlaceholder, filters,
    rows, columns, keyOf, ariaLabel, isLoading, error, onRetry,
    emptyTitle, emptyDescription, emptyAction, onRowClick, rowActions, renderMobileCard, pagination,
  } = props;

  const toolbar = (searchValue !== undefined || filters) ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {searchValue !== undefined ? (
        <div className="relative w-full sm:max-w-xs">
          <input
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder ?? 'بحث...'}
            className="h-9 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
            dir="rtl"
          />
        </div>
      ) : <div />}
      {filters ? <div className="flex items-center gap-2">{filters}</div> : null}
    </div>
  ) : undefined;

  return (
    <EnterprisePage
      title={title}
      description={description}
      actions={<>{primaryAction}{secondaryActions}</>}
      toolbar={toolbar}
      maxWidth="full"
      gap="md"
    >
      <EnterpriseDataTable
        rows={rows}
        columns={columns}
        keyOf={keyOf}
        aria-label={ariaLabel}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={emptyAction}
        onRowClick={onRowClick}
        rowActions={rowActions}
        renderMobileCard={renderMobileCard}
        pagination={pagination}
        density="compact"
      />
    </EnterprisePage>
  );
}
