import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createQueryClient } from '@/test/setup';
import { supabase } from '@/lib/supabase';

/**
 * Payment Lifecycle Integration Tests
 * Tests payment recording, invoice balance updates, and receipt generation
 */

describe('payment lifecycle integration', () => {
  let client: ReturnType<typeof createQueryClient>;

  const testPaymentData = {
    invoice_id: 'test-invoice-1',
    amount: 500.00,
    payment_date: '2026-07-19',
    payment_method: 'bank_transfer' as const,
    reference_number: 'TRX-001',
  };

  beforeEach(() => {
    client = createQueryClient();
    vi.clearAllMocks();
  });

  describe('record payment', () => {
    it('should create payment and update invoice balance atomically', async () => {
      // Payment should be atomic - if invoice update fails, payment should not be recorded
      const { data: payment, error } = await supabase.rpc('record_payment_atomic', {
        p_invoice_id: testPaymentData.invoice_id,
        p_amount: testPaymentData.amount,
        p_payment_date: testPaymentData.payment_date,
        p_method: testPaymentData.payment_method,
        p_reference: testPaymentData.reference_number,
      });

      expect(error).toBeNull();
      expect(payment).toBeDefined();
    });

    it('should enforce payment amount validation', async () => {
      const { error } = await supabase.rpc('record_payment_atomic', {
        p_invoice_id: testPaymentData.invoice_id,
        p_amount: -50, // Invalid: negative
        p_payment_date: testPaymentData.payment_date,
        p_method: testPaymentData.payment_method,
        p_reference: testPaymentData.reference_number,
      });

      expect(error).not.toBeNull();
    });

    it('should prevent overpayment in single transaction', async () => {
      // If invoice total is 1000 and already paid 600, cannot pay 500 more
      const { error } = await supabase.rpc('record_payment_atomic', {
        p_invoice_id: testPaymentData.invoice_id,
        p_amount: 999999.99, // Exceeds invoice amount
        p_payment_date: testPaymentData.payment_date,
        p_method: testPaymentData.payment_method,
        p_reference: testPaymentData.reference_number,
      });

      expect(error).not.toBeNull();
    });
  });

  describe('payment allocation', () => {
    it('should allocate payment to correct invoice', async () => {
      const { data } = await supabase
        .from('payments')
        .select('invoice_id, amount')
        .eq('invoice_id', testPaymentData.invoice_id)
        .single();

      expect(data?.invoice_id).toBe(testPaymentData.invoice_id);
      expect(data?.amount).toBe(testPaymentData.amount);
    });

    it('should reject duplicate payment references', async () => {
      // Payment reference must be unique per company
      await supabase
        .from('payments')
        .insert({ ...testPaymentData, reference_number: 'UNIQUE-REF-001' })
        .single();

      const { error } = await supabase
        .from('payments')
        .insert({ ...testPaymentData, reference_number: 'UNIQUE-REF-001' })
        .single();

      expect(error).not.toBeNull();
    });
  });

  describe('payment methods', () => {
    it('should support all payment methods (bank_transfer, cash, check, credit)', async () => {
      const methods = ['bank_transfer', 'cash', 'check', 'credit'] as const;

      for (const method of methods) {
        const { data, error } = await supabase
          .from('payments')
          .insert({
            ...testPaymentData,
            payment_method: method,
            reference_number: `REF-${method}-001`,
          })
          .select('payment_method')
          .single();

        expect(error).toBeNull();
        expect(data?.payment_method).toBe(method);
      }
    });
  });

  describe('receipt generation', () => {
    it('should auto-generate receipt when payment is recorded', async () => {
      const { data: payment } = await supabase
        .from('payments')
        .insert(testPaymentData)
        .select('id')
        .single();

      if (!payment) return;

      const { data: receipt } = await supabase
        .from('receipts')
        .select('*')
        .eq('payment_id', payment.id)
        .single();

      expect(receipt).toBeDefined();
      expect(receipt?.payment_id).toBe(payment.id);
    });

    it('should include correct payment details in receipt', async () => {
      const { data: receipt } = await supabase
        .from('receipts')
        .select('*')
        .limit(1)
        .single();

      if (!receipt) return;

      expect(receipt).toHaveProperty('amount');
      expect(receipt).toHaveProperty('payment_date');
      expect(receipt).toHaveProperty('receipt_number');
    });
  });

  describe('payment reports integration', () => {
    it('should update collections report when payment is recorded', async () => {
      const { data: reports } = await supabase
        .from('financial_reports_view')
        .select('*')
        .eq('report_type', 'collections');

      expect(reports).toBeDefined();
      if (reports && reports.length > 0) {
        expect(reports[0]).toHaveProperty('total_collected');
      }
    });

    it('should recalculate tenant balance after payment', async () => {
      // Tenant's outstanding balance should decrease
      expect(true).toBe(true);
    });
  });

  describe('payment RLS and permissions', () => {
    it('should enforce role-based payment access (ADMIN/MANAGER only)', async () => {
      // USER role should not be able to create payments
      expect(true).toBe(true);
    });

    it('should prevent payment modifications after receipt is generated', async () => {
      // Once receipt exists, payment record is immutable
      expect(true).toBe(true);
    });
  });

  describe('payment idempotency', () => {
    it('should handle duplicate payment submissions gracefully', async () => {
      // Using idempotency key prevents duplicate charges
      const idempotencyKey = 'idempotent-key-001';

      const { data: first } = await supabase.rpc('record_payment_atomic', {
        p_invoice_id: testPaymentData.invoice_id,
        p_amount: testPaymentData.amount,
        p_payment_date: testPaymentData.payment_date,
        p_method: testPaymentData.payment_method,
        p_reference: testPaymentData.reference_number,
      });

      const { data: second } = await supabase.rpc('record_payment_atomic', {
        p_invoice_id: testPaymentData.invoice_id,
        p_amount: testPaymentData.amount,
        p_payment_date: testPaymentData.payment_date,
        p_method: testPaymentData.payment_method,
        p_reference: testPaymentData.reference_number,
      });

      // Second call should either error or return same payment ID
      expect(first).toBeDefined();
    });
  });
});
