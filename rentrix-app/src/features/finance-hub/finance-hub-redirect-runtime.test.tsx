// @vitest-environment happy-dom
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, redirect, lazyRouteComponent } from '@tanstack/react-router';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Runtime proof that legacy finance URLs keep their query parameters.
 *
 * The sibling deep-link test asserts the *shape* of the redirect in
 * route-tree.ts. This one drives a real TanStack router through the same
 * redirect and inspects the resulting location, so it also catches router
 * behaviour a source check cannot see (for example a `search` function being
 * ignored, or the destination dropping params during validation).
 *
 * The route definitions below mirror the shipped ones in route-tree.ts.
 */
afterEach(cleanup);

function buildRouter(initialUrl: string) {
  const root = createRootRoute();
  const target = createRoute({
    getParentRoute: () => root, path: '/finance/collections',
    validateSearch: (s: Record<string, unknown>) => s,
    component: () => <div>hub</div>,
  });
  const target2 = createRoute({
    getParentRoute: () => root, path: '/finance/expenses',
    validateSearch: (s: Record<string, unknown>) => s,
    component: () => <div>hub2</div>,
  });
  const legacyInvoices = createRoute({
    getParentRoute: () => root, path: '/invoices',
    validateSearch: (s: Record<string, unknown>) => s,
    beforeLoad: () => { throw redirect({ to: '/finance/collections', search: (previous: Record<string, unknown>) => ({ ...previous, section: 'invoices' }) }); },
  });
  const legacyArrears = createRoute({
    getParentRoute: () => root, path: '/arrears',
    validateSearch: (s: Record<string, unknown>) => s,
    beforeLoad: () => { throw redirect({ to: '/finance/expenses', search: (previous: Record<string, unknown>) => ({ ...previous, section: 'arrears' }) }); },
  });
  const legacyReceipts = createRoute({
    getParentRoute: () => root, path: '/receipts',
    validateSearch: (s: Record<string, unknown>) => s,
    beforeLoad: ({ search }) => {
      const rid = (search as Record<string, unknown>).receiptId;
      if (typeof rid === 'string' && rid !== '') return;
      throw redirect({ to: '/finance/collections', search: (previous: Record<string, unknown>) => ({ ...previous, section: 'receipts' }) });
    },
    component: () => <div>receipt-doc</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([target, target2, legacyInvoices, legacyArrears, legacyReceipts]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  return router;
}

async function go(url: string) {
  const router = buildRouter(url);
  render(<RouterProvider router={router as never} />);
  await router.load();
  return router.state.location;
}

describe('RUNTIME: legacy finance redirects preserve query params', () => {
  it('invoice collect deep link keeps invoiceId and collect', async () => {
    const loc = await go('/invoices?invoiceId=inv-123&collect=1');
    expect(loc.pathname).toBe('/finance/collections');
    // TanStack coerces numeric-looking params; parseQuickCollectSearch accepts
    // both '1' and 1, so assert the value survives in either form.
    const s = loc.search as Record<string, unknown>;
    expect(s.invoiceId).toBe('inv-123');
    expect(s.section).toBe('invoices');
    expect([1, '1']).toContain(s.collect);
  });

  it('arrears redirect keeps arbitrary workflow params', async () => {
    const loc = await go('/arrears?propertyId=p-9&from=2026-01-01');
    expect(loc.pathname).toBe('/finance/expenses');
    expect(loc.search).toMatchObject({ propertyId: 'p-9', from: '2026-01-01', section: 'arrears' });
  });

  it('receipts list redirect keeps params', async () => {
    const loc = await go('/receipts?q=abc');
    expect(loc.pathname).toBe('/finance/collections');
    expect(loc.search).toMatchObject({ q: 'abc', section: 'receipts' });
  });

  it('receipt PRINT deep link is served in place, not redirected', async () => {
    const loc = await go('/receipts?receiptId=r-77');
    expect(loc.pathname).toBe('/receipts');
    expect(loc.search).toMatchObject({ receiptId: 'r-77' });
  });

  it('an explicit section in the URL is overridden by the route it came from', async () => {
    // /invoices?section=commissions must still land on invoices: the legacy
    // path defines the section, otherwise a stale link could cross sections.
    const loc = await go('/invoices?section=commissions');
    expect(loc.search).toMatchObject({ section: 'invoices' });
  });
});
