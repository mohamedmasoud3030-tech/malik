export const PROPERTY_OPERATING_MODELS = [
  'UNCLASSIFIED',
  'OWNER_AGENCY',
  'MASTER_LEASE',
  'OFFICE_OWNED',
  'BROKERAGE_ONLY',
] as const;

export const AGREEMENT_OPERATING_MODELS = [
  'AGENCY_MANAGEMENT',
  'MASTER_LEASE',
  'COLLECTION_ONLY',
] as const;

export const PAYMENT_CYCLES = ['monthly', 'quarterly', 'semi_annual', 'annual'] as const;

export type PropertyOperatingModel = (typeof PROPERTY_OPERATING_MODELS)[number];
export type AgreementOperatingModel = (typeof AGREEMENT_OPERATING_MODELS)[number];
export type AgreementType = 'property_management' | 'master_lease';
export type CommissionType = 'RATE' | 'FIXED_MONTHLY';
export type FeeBasis = 'PERCENTAGE_COLLECTED' | 'PERCENTAGE_BILLED' | 'FIXED_MONTHLY';
export type FeeTrigger = 'COLLECTION' | 'INVOICE_ISSUE' | 'PERIOD_END';
export type BillingBasis = 'FULL_MONTH' | 'DAILY_PRORATED';
export type SettlementFrequency = 'MONTHLY' | 'QUARTERLY' | 'ON_DEMAND';
export type Responsibility = 'OWNER' | 'OFFICE' | 'TENANT' | 'SHARED';
export type SecurityDepositBeneficiary = 'OWNER' | 'OFFICE' | 'HELD_IN_TRUST';
export type PaymentCycle = (typeof PAYMENT_CYCLES)[number];
export type PaymentDueTiming = 'ADVANCE' | 'ARREARS';
export type ContractProrationBasis = 'FULL_INSTALLMENT' | 'DAILY_PRORATED';
export type ContractKind = 'NEW' | 'RENEWAL' | 'AMENDMENT' | 'SUBLEASE';
export type LateFeeType = 'NONE' | 'FIXED' | 'RATE';

export interface OwnerAgreementBusinessTerms {
  agreementType: AgreementType;
  commissionType: CommissionType;
  commissionValue: number;
  operatingModel: AgreementOperatingModel;
  feeBasis: FeeBasis;
  feeTrigger: FeeTrigger;
  billingBasis: BillingBasis;
  settlementFrequency: SettlementFrequency;
  settlementDay: number;
  reserveAmount: number;
  expenseApprovalLimit: number;
  maintenanceResponsibility: Responsibility;
  utilitiesResponsibility: Responsibility;
  taxesResponsibility: Responsibility;
  securityDepositBeneficiary: SecurityDepositBeneficiary;
  settlementRequiresApproval: boolean;
  earlyTerminationNoticeDays: number;
}

export interface AccountingPerspective {
  presentation: 'NET' | 'GROSS';
  agencyRole: 'AGENT' | 'PRINCIPAL';
  collectionCreditorRole: 'OWNER_IS_CREDITOR' | 'OFFICE_IS_CREDITOR' | 'NOT_APPLICABLE';
  recognizesTenantRentAsOfficeRevenue: boolean;
}

export interface ContractScheduleInput {
  startDate: string;
  endDate: string;
  installmentAmount: number;
  paymentCycle: PaymentCycle;
  firstDueDate?: string | null;
  billingAnchorDay?: number | null;
  paymentDueTiming?: PaymentDueTiming;
  prorationBasis?: ContractProrationBasis;
}

export interface ContractInstallmentPreview {
  installmentNo: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  scheduledAmount: number;
  isProrated: boolean;
}

export function defaultAgreementBusinessTerms(
  agreementType: AgreementType,
  commissionType: CommissionType,
  commissionValue: number,
): OwnerAgreementBusinessTerms {
  const isMasterLease = agreementType === 'master_lease';
  const isFixed = commissionType === 'FIXED_MONTHLY';

  return {
    agreementType,
    commissionType,
    commissionValue,
    operatingModel: isMasterLease ? 'MASTER_LEASE' : 'AGENCY_MANAGEMENT',
    feeBasis: isFixed ? 'FIXED_MONTHLY' : 'PERCENTAGE_COLLECTED',
    feeTrigger: isFixed ? 'PERIOD_END' : 'COLLECTION',
    billingBasis: 'FULL_MONTH',
    settlementFrequency: 'MONTHLY',
    settlementDay: 5,
    reserveAmount: 0,
    expenseApprovalLimit: 0,
    maintenanceResponsibility: 'OWNER',
    utilitiesResponsibility: 'TENANT',
    taxesResponsibility: 'OWNER',
    securityDepositBeneficiary: isMasterLease ? 'OFFICE' : 'OWNER',
    settlementRequiresApproval: true,
    earlyTerminationNoticeDays: 30,
  };
}

export function assertAgreementBusinessTerms(terms: OwnerAgreementBusinessTerms): void {
  if (terms.agreementType === 'master_lease' && terms.operatingModel !== 'MASTER_LEASE') {
    throw new Error('الاستئجار الرئيسي يجب أن يعمل بنموذج MASTER_LEASE.');
  }
  if (
    terms.agreementType === 'property_management'
    && !(['AGENCY_MANAGEMENT', 'COLLECTION_ONLY'] as const).includes(
      terms.operatingModel as 'AGENCY_MANAGEMENT' | 'COLLECTION_ONLY',
    )
  ) {
    throw new Error('اتفاقية إدارة العقار يجب أن تكون إدارة بالوكالة أو تحصيل فقط.');
  }
  if (terms.commissionType === 'RATE') {
    if (!['PERCENTAGE_COLLECTED', 'PERCENTAGE_BILLED'].includes(terms.feeBasis)) {
      throw new Error('العمولة النسبية تحتاج أساسًا نسبيًا للتحصيل أو الفوترة.');
    }
    if (!Number.isFinite(terms.commissionValue) || terms.commissionValue < 0 || terms.commissionValue > 100) {
      throw new Error('نسبة أتعاب الإدارة يجب أن تكون بين 0 و100.');
    }
  }
  if (terms.commissionType === 'FIXED_MONTHLY') {
    if (terms.feeBasis !== 'FIXED_MONTHLY') {
      throw new Error('الأتعاب الشهرية الثابتة تحتاج أساس FIXED_MONTHLY.');
    }
    if (!Number.isFinite(terms.commissionValue) || terms.commissionValue < 0) {
      throw new Error('قيمة الأتعاب الشهرية لا يمكن أن تكون سالبة.');
    }
  }
  if (!Number.isInteger(terms.settlementDay) || terms.settlementDay < 1 || terms.settlementDay > 28) {
    throw new Error('يوم تسوية المالك يجب أن يكون بين 1 و28.');
  }
  for (const [label, value] of [
    ['الاحتياطي', terms.reserveAmount],
    ['حد اعتماد المصروف', terms.expenseApprovalLimit],
    ['مهلة الإنهاء', terms.earlyTerminationNoticeDays],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} لا يمكن أن يكون سالبًا.`);
    }
  }
}

export function deriveAccountingPerspective(
  operatingModel: PropertyOperatingModel | AgreementOperatingModel,
): AccountingPerspective {
  if (operatingModel === 'MASTER_LEASE' || operatingModel === 'OFFICE_OWNED') {
    return {
      presentation: 'GROSS',
      agencyRole: 'PRINCIPAL',
      collectionCreditorRole: 'OFFICE_IS_CREDITOR',
      recognizesTenantRentAsOfficeRevenue: true,
    };
  }

  if (operatingModel === 'BROKERAGE_ONLY') {
    return {
      presentation: 'NET',
      agencyRole: 'AGENT',
      collectionCreditorRole: 'NOT_APPLICABLE',
      recognizesTenantRentAsOfficeRevenue: false,
    };
  }

  return {
    presentation: 'NET',
    agencyRole: 'AGENT',
    collectionCreditorRole: 'OWNER_IS_CREDITOR',
    recognizesTenantRentAsOfficeRevenue: false,
  };
}

export function paymentCycleMonths(paymentCycle: PaymentCycle): number {
  switch (paymentCycle) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi_annual': return 6;
    case 'annual': return 12;
  }
}

export function assertLateFeeTerms(type: LateFeeType, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('قيمة غرامة التأخير لا يمكن أن تكون سالبة.');
  }
  if (type === 'NONE' && value !== 0) {
    throw new Error('نوع الغرامة NONE يتطلب قيمة صفر.');
  }
  if (type === 'RATE' && value > 100) {
    throw new Error('نسبة غرامة التأخير يجب ألا تتجاوز 100%.');
  }
}

export function buildContractInstallmentPreview(
  input: ContractScheduleInput,
): ContractInstallmentPreview[] {
  const start = parseDateOnly(input.startDate, 'تاريخ بداية العقد');
  const end = parseDateOnly(input.endDate, 'تاريخ نهاية العقد');
  if (end.getTime() < start.getTime()) {
    throw new Error('تاريخ نهاية العقد يجب ألا يسبق تاريخ البداية.');
  }
  if (!Number.isFinite(input.installmentAmount) || input.installmentAmount < 0) {
    throw new Error('قيمة الدفعة التعاقدية لا يمكن أن تكون سالبة.');
  }

  const cycleMonths = paymentCycleMonths(input.paymentCycle);
  const anchorDay = input.billingAnchorDay ?? Math.min(start.getUTCDate(), 28);
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 28) {
    throw new Error('يوم تثبيت دورة الاستحقاق يجب أن يكون بين 1 و28.');
  }

  const dueTiming = input.paymentDueTiming ?? 'ADVANCE';
  const prorationBasis = input.prorationBasis ?? 'FULL_INSTALLMENT';
  const firstDueDate = input.firstDueDate
    ? formatDateOnly(parseDateOnly(input.firstDueDate, 'تاريخ أول استحقاق'))
    : null;
  const result: ContractInstallmentPreview[] = [];

  for (let offset = 0, installmentNo = 1; ; offset += cycleMonths, installmentNo += 1) {
    const cycleStart = cycleDate(start, offset, anchorDay);
    if (cycleStart.getTime() > end.getTime()) break;

    const periodStart = installmentNo === 1 ? start : cycleStart;
    const nextPeriodStart = cycleDate(start, offset + cycleMonths, anchorDay);
    const nominalPeriodEnd = addDays(nextPeriodStart, -1);
    const periodEnd = nominalPeriodEnd.getTime() > end.getTime() ? end : nominalPeriodEnd;
    const isProrated = prorationBasis === 'DAILY_PRORATED'
      && periodEnd.getTime() < nominalPeriodEnd.getTime();
    const nominalDays = differenceInDaysInclusive(periodStart, nominalPeriodEnd);
    const coveredDays = differenceInDaysInclusive(periodStart, periodEnd);
    const scheduledAmount = isProrated
      ? roundCurrency(input.installmentAmount * coveredDays / nominalDays)
      : roundCurrency(input.installmentAmount);
    const dueDate = installmentNo === 1 && firstDueDate
      ? firstDueDate
      : formatDateOnly(dueTiming === 'ARREARS' ? periodEnd : periodStart);

    result.push({
      installmentNo,
      periodStart: formatDateOnly(periodStart),
      periodEnd: formatDateOnly(periodEnd),
      dueDate,
      scheduledAmount,
      isProrated,
    });
  }

  return result;
}

export function scheduleTotal(schedule: readonly ContractInstallmentPreview[]): number {
  return roundCurrency(schedule.reduce((total, installment) => total + installment.scheduledAmount, 0));
}

function parseDateOnly(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} غير صالح.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== value) {
    throw new Error(`${label} غير صالح.`);
  }
  return parsed;
}

function cycleDate(contractStart: Date, monthOffset: number, anchorDay: number): Date {
  const monthStart = new Date(Date.UTC(
    contractStart.getUTCFullYear(),
    contractStart.getUTCMonth() + monthOffset,
    1,
  ));
  const lastDay = new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  monthStart.setUTCDate(Math.min(anchorDay, lastDay));
  return monthStart;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function differenceInDaysInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}
