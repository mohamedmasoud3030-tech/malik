// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Shell parity for the REAL finance pages.
 *
 * The hub behaviour suite replaces the eight section bodies with probes, so it
 * proves the hub composes correctly but can never see a duplicate layout
 * *inside* a real page. This suite renders each shipped page component for
 * real — only the data layer is stubbed — and asserts the shell invariant that
 * the whole refactor rests on:
 *
 *   standalone -> exactly one PageLayout and one PageHeader
 *   embedded   -> zero of each (the hub already supplied them)
 *
 * If anyone reintroduces a nested PageLayout/PageHeader in any finance page,
 * or wires a page so embedded mode is ignored, this fails.
 */

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    authorization: { userId: 'u-admin', email: 'admin@example.com', role: 'ADMIN' },
    authorizationDiagnostics: { resolvedRole: 'ADMIN', hasUserRoleMetadata: true, hasRoleMetadata: true, metadataMismatch: false },
    user: { id: 'u-admin' },
    session: null,
    isLoading: false,
  }),
}));

// Neutralise every data hook these pages call so the render is deterministic
// and offline. Shapes match what each page destructures.
const emptyQuery = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(), isPending: false, isSuccess: false };
const listQuery = { ...emptyQuery, data: { rows: [], truncated: false } };
const arrayQuery = { ...emptyQuery, data: [] };
const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null, reset: vi.fn() };

vi.mock('@/features/financials/invoices/useInvoices', () => ({
  useInvoices: () => listQuery, useInvoice: () => emptyQuery, useCreateInvoice: () => mutation,
  useRecordPayment: () => mutation, useGenerateInvoices: () => mutation, useUpdateInvoice: () => mutation,
}));
vi.mock('@/features/financials/receipts/useReceipts', () => ({
  useReceipts: () => arrayQuery, useReceipt: () => emptyQuery, useVoidReceipt: () => mutation,
}));
vi.mock('@/features/financials/expenses/useExpenses', () => ({
  useExpenses: () => listQuery, useCreateExpenseAtomic: () => mutation, useUpdateExpense: () => mutation,
}));
vi.mock('@/features/properties/use-properties', () => ({ useProperties: () => listQuery }));
vi.mock('@/features/settings/useCostCenters', () => ({ useCostCenters: () => arrayQuery }));
vi.mock('@/features/commissions/use-commissions', () => ({
  useCommissions: () => arrayQuery, useSaveCommission: () => mutation, useArchiveCommission: () => mutation,
}));

vi.mock('@/features/financials/components/invoice-workspace-section', () => ({
  InvoiceWorkspaceSection: () => <div data-testid="invoices-section">invoices</div>,
}));
vi.mock('@/features/financials/components/arrears-workspace-section', () => ({
  ArrearsWorkspaceSection: () => <div data-testid="arrears-section">arrears</div>,
}));
vi.mock('@/features/financials/deposits/deposits-workspace', () => ({
  DepositsWorkspace: () => <div data-testid="deposits-section">deposits</div>,
}));
vi.mock('@/features/owners/components/OwnerSettlementWorkspace', () => ({
  OwnerSettlementWorkspace: () => <div data-testid="settlements-section">settlements</div>,
}));
vi.mock('@/features/commissions/components/commissions-view', () => ({
  CommissionsView: () => <div data-testid="commissions-section">commissions</div>,
}));
vi.mock('@/features/financials/reconciliation/useBankReconciliationController', () => ({
  statusLabels: { unmatched: 'غير مطابقة', matched: 'مطابقة', ignored: 'متجاهلة' },
  entityLabels: {},
  emptyMatchDraft: {},
  // Mirrors the real controller surface consumed by the page (see the
  // `ctrl.*` reads in bank-reconciliation-page.tsx).
  useBankReconciliationController: () => ({
    filters: { bankAccountId: '', status: '', from: '', to: '' },
    setFilters: vi.fn(),
    hasFilters: false,
    accounts: [],
    accountsQuery: emptyQuery,
    lines: [],
    linesQuery: emptyQuery,
    suggestionsQuery: emptyQuery,
    unmatchedLines: [],
    selectedLine: null,
    summary: { totalLines: 0, unmatchedCount: 0, matchedCount: 0, unmatchedAmount: 0 },
    canManageReconciliation: true,
    importFormOpen: false, setImportFormOpen: vi.fn(),
    matchFormOpen: false, setMatchFormOpen: vi.fn(),
    lineFormOpen: false, setLineFormOpen: vi.fn(),
    importDraft: {}, setImportDraft: vi.fn(),
    matchDraft: {}, setMatchDraft: vi.fn(),
    lineDraft: {}, setLineDraft: vi.fn(),
    openImportForm: vi.fn(), openMatchForm: vi.fn(), openManualLineForm: vi.fn(),
    handleImportCsvSubmit: vi.fn(), handleMatchLineSubmit: vi.fn(),
    handleCreateLineSubmit: vi.fn(), handleIgnoreLineConfirm: vi.fn(),
    pendingIgnoreLine: null, setPendingIgnoreLineId: vi.fn(),
    importCsv: mutation, matchLine: mutation, createLine: mutation, ignoreLine: mutation,
    writeError: null,
  }),
}));

const { InvoicesWorkspace } = await import('@/features/financials/invoices/invoices-page');
const { ReceiptsWorkspace } = await import('@/features/financials/receipts/receipts-page');
const { ExpensesWorkspace } = await import('@/features/financials/expenses/expenses-page');
const { ArrearsWorkspace } = await import('@/features/financials/arrears/arrears-page');
const { DepositsWorkspace } = await import('@/features/financials/deposits/deposits-page');
const { OwnerSettlementsWorkspace } = await import('@/features/owners/owner-settlements-page');
const { BankReconciliationWorkspace } = await import('@/features/financials/reconciliation/bank-reconciliation-page');
const { CommissionsWorkspace } = await import('@/features/commissions/commissions-page');

type WorkspaceComponent = ComponentType<{ embedded?: boolean }>;

const financeWorkspaces: ReadonlyArray<readonly [string, WorkspaceComponent]> = [
  ['invoices', InvoicesWorkspace],
  ['receipts', ReceiptsWorkspace],
  ['expenses', ExpensesWorkspace],
  ['arrears', ArrearsWorkspace],
  ['deposits', DepositsWorkspace],
  ['owner_settlements', OwnerSettlementsWorkspace],
  ['bank_reconciliation', BankReconciliationWorkspace],
  ['commissions', CommissionsWorkspace],
];

async function renderWorkspace(Component: WorkspaceComponent, embedded: boolean) {
  const root = createRootRoute();
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <Component embedded={embedded} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('every finance page renders exactly one shell standalone', () => {
  for (const [name, Component] of financeWorkspaces) {
    it(`${name}: one PageLayout and at most one PageHeader`, async () => {
      const { container } = await renderWorkspace(Component, false);

      expect(container.querySelectorAll('[data-page-layout]').length, `${name} PageLayout`).toBe(1);
      // Commissions renders its heading inside its view, so it legitimately has
      // no PageHeader; every other page must have exactly one.
      const headers = container.querySelectorAll('[data-page-header]').length;
      expect(headers, `${name} PageHeader`).toBe(name === 'commissions' ? 0 : 1);
    });
  }
});

describe('every finance page renders no shell when embedded', () => {
  for (const [name, Component] of financeWorkspaces) {
    it(`${name}: zero PageLayout and zero PageHeader`, async () => {
      const { container } = await renderWorkspace(Component, true);

      expect(container.querySelectorAll('[data-page-layout]').length, `${name} must not nest a layout`).toBe(0);
      expect(container.querySelectorAll('[data-page-header]').length, `${name} must not nest a header`).toBe(0);
    });
  }
});

describe('embedded mode still renders the workspace body', () => {
  for (const [name, Component] of financeWorkspaces) {
    it(`${name}: body content is present`, async () => {
      const { container } = await renderWorkspace(Component, true);
      expect(container.textContent?.trim().length ?? 0, `${name} rendered nothing`).toBeGreaterThan(0);
    });
  }
});
