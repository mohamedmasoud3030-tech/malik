import { describe, expect, it } from 'vitest';
import {
  assertAgreementBusinessTerms,
  assertLateFeeTerms,
  buildContractInstallmentPreview,
  defaultAgreementBusinessTerms,
  deriveAccountingPerspective,
  scheduleTotal,
} from './business-model';

describe('property-management business model', () => {
  it('defaults agency management to collected-rent fees and owner creditor accounting', () => {
    const terms = defaultAgreementBusinessTerms('property_management', 'RATE', 7.5);

    expect(terms).toMatchObject({
      operatingModel: 'AGENCY_MANAGEMENT',
      feeBasis: 'PERCENTAGE_COLLECTED',
      feeTrigger: 'COLLECTION',
      securityDepositBeneficiary: 'OWNER',
      settlementFrequency: 'MONTHLY',
    });
    expect(() => assertAgreementBusinessTerms(terms)).not.toThrow();
    expect(deriveAccountingPerspective(terms.operatingModel)).toEqual({
      presentation: 'NET',
      agencyRole: 'AGENT',
      collectionCreditorRole: 'OWNER_IS_CREDITOR',
      recognizesTenantRentAsOfficeRevenue: false,
    });
  });

  it('defaults master lease to principal/gross and office creditor behavior', () => {
    const terms = defaultAgreementBusinessTerms('master_lease', 'FIXED_MONTHLY', 1_250);

    expect(terms).toMatchObject({
      operatingModel: 'MASTER_LEASE',
      feeBasis: 'FIXED_MONTHLY',
      feeTrigger: 'PERIOD_END',
      securityDepositBeneficiary: 'OFFICE',
    });
    expect(() => assertAgreementBusinessTerms(terms)).not.toThrow();
    expect(deriveAccountingPerspective(terms.operatingModel)).toMatchObject({
      presentation: 'GROSS',
      agencyRole: 'PRINCIPAL',
      collectionCreditorRole: 'OFFICE_IS_CREDITOR',
      recognizesTenantRentAsOfficeRevenue: true,
    });
  });

  it('rejects a master lease mislabeled as agency management', () => {
    const terms = defaultAgreementBusinessTerms('master_lease', 'RATE', 10);
    expect(() => assertAgreementBusinessTerms({ ...terms, operatingModel: 'AGENCY_MANAGEMENT' }))
      .toThrow('الاستئجار الرئيسي');
  });

  it('rejects inconsistent fee bases and invalid percentage values', () => {
    const terms = defaultAgreementBusinessTerms('property_management', 'RATE', 10);
    expect(() => assertAgreementBusinessTerms({ ...terms, feeBasis: 'FIXED_MONTHLY' }))
      .toThrow('العمولة النسبية');
    expect(() => assertAgreementBusinessTerms({ ...terms, commissionValue: 100.001 }))
      .toThrow('بين 0 و100');
  });

  it('treats brokerage-only properties as non-rent-ledger relationships', () => {
    expect(deriveAccountingPerspective('BROKERAGE_ONLY')).toEqual({
      presentation: 'NET',
      agencyRole: 'AGENT',
      collectionCreditorRole: 'NOT_APPLICABLE',
      recognizesTenantRentAsOfficeRevenue: false,
    });
  });
});

describe('contractual billing schedule', () => {
  it('uses contract start as the billing anchor instead of calendar-month guessing', () => {
    const schedule = buildContractInstallmentPreview({
      startDate: '2026-01-15',
      endDate: '2026-03-14',
      installmentAmount: 500,
      paymentCycle: 'monthly',
    });

    expect(schedule).toEqual([
      {
        installmentNo: 1,
        periodStart: '2026-01-15',
        periodEnd: '2026-02-14',
        dueDate: '2026-01-15',
        scheduledAmount: 500,
        isProrated: false,
      },
      {
        installmentNo: 2,
        periodStart: '2026-02-15',
        periodEnd: '2026-03-14',
        dueDate: '2026-02-15',
        scheduledAmount: 500,
        isProrated: false,
      },
    ]);
    expect(scheduleTotal(schedule)).toBe(1_000);
  });

  it('supports arrears due dates and a first due date before occupancy begins', () => {
    const schedule = buildContractInstallmentPreview({
      startDate: '2026-04-01',
      endDate: '2026-05-31',
      installmentAmount: 300,
      paymentCycle: 'monthly',
      paymentDueTiming: 'ARREARS',
      firstDueDate: '2026-03-25',
    });

    expect(schedule[0].dueDate).toBe('2026-03-25');
    expect(schedule[1].dueDate).toBe('2026-05-31');
  });

  it('prorates only the partial final contractual period at OMR precision', () => {
    const schedule = buildContractInstallmentPreview({
      startDate: '2026-01-01',
      endDate: '2026-05-31',
      installmentAmount: 300,
      paymentCycle: 'quarterly',
      prorationBasis: 'DAILY_PRORATED',
    });

    expect(schedule).toHaveLength(2);
    expect(schedule[0]).toMatchObject({
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      scheduledAmount: 300,
      isProrated: false,
    });
    expect(schedule[1]).toMatchObject({
      periodStart: '2026-04-01',
      periodEnd: '2026-05-31',
      scheduledAmount: 201.099,
      isProrated: true,
    });
    expect(scheduleTotal(schedule)).toBe(501.099);
  });

  it('preserves the full installment when proration was not contracted', () => {
    const schedule = buildContractInstallmentPreview({
      startDate: '2026-01-01',
      endDate: '2026-05-31',
      installmentAmount: 300,
      paymentCycle: 'quarterly',
      prorationBasis: 'FULL_INSTALLMENT',
    });

    expect(schedule.at(-1)).toMatchObject({ scheduledAmount: 300, isProrated: false });
    expect(scheduleTotal(schedule)).toBe(600);
  });

  it('validates late-fee terms independently from rent recognition', () => {
    expect(() => assertLateFeeTerms('RATE', 5)).not.toThrow();
    expect(() => assertLateFeeTerms('RATE', 101)).toThrow('100%');
    expect(() => assertLateFeeTerms('NONE', 1)).toThrow('قيمة صفر');
  });
});
