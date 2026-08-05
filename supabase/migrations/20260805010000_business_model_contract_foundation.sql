-- Stage 4.5: business-model and contract-lifecycle foundation.
--
-- This migration deliberately creates contractual obligations before accounting
-- events. It does not insert invoices, payments, owner settlements, journal
-- batches, or journal lines. Later accounting stages consume the explicit
-- business context and billing schedule created here.

begin;

-- ---------------------------------------------------------------------------
-- 1. Property operating model
-- ---------------------------------------------------------------------------

alter table public.properties
  add column if not exists operating_model text;

update public.properties as p
   set operating_model = coalesce(
     (
       select case oa.agreement_type
         when 'master_lease' then 'MASTER_LEASE'
         else 'OWNER_AGENCY'
       end
         from public.owner_agreements as oa
        where oa.property_id::text = p.id::text
          and oa.company_id = p.company_id
          and oa.starts_on <= current_date
          and (oa.ends_on is null or oa.ends_on >= current_date)
        order by oa.starts_on desc, oa.created_at desc
        limit 1
     ),
     'UNCLASSIFIED'
   )
 where p.operating_model is null;

alter table public.properties
  alter column operating_model set default 'UNCLASSIFIED',
  alter column operating_model set not null;

alter table public.properties
  drop constraint if exists properties_operating_model_check;
alter table public.properties
  add constraint properties_operating_model_check check (
    operating_model in (
      'UNCLASSIFIED',
      'OWNER_AGENCY',
      'MASTER_LEASE',
      'OFFICE_OWNED',
      'BROKERAGE_ONLY'
    )
  );

comment on column public.properties.operating_model is
  'Commercial operating model. Active owner agreement wins in current_property_business_model; OFFICE_OWNED and BROKERAGE_ONLY remain explicit property choices.';

-- ---------------------------------------------------------------------------
-- 2. Owner agreement business terms
-- ---------------------------------------------------------------------------

alter table public.owner_agreements
  add column if not exists operating_model text,
  add column if not exists lifecycle_status text,
  add column if not exists fee_basis text,
  add column if not exists fee_trigger text,
  add column if not exists billing_basis text,
  add column if not exists settlement_frequency text,
  add column if not exists settlement_day smallint,
  add column if not exists reserve_amount numeric(18,3),
  add column if not exists expense_approval_limit numeric(18,3),
  add column if not exists maintenance_responsibility text,
  add column if not exists utilities_responsibility text,
  add column if not exists taxes_responsibility text,
  add column if not exists security_deposit_beneficiary text,
  add column if not exists settlement_requires_approval boolean,
  add column if not exists early_termination_notice_days integer,
  add column if not exists terms_version integer,
  add column if not exists custom_terms jsonb,
  add column if not exists activated_at timestamptz,
  add column if not exists terminated_at timestamptz,
  add column if not exists termination_reason text;

update public.owner_agreements
   set operating_model = coalesce(
         operating_model,
         case agreement_type
           when 'master_lease' then 'MASTER_LEASE'
           else 'AGENCY_MANAGEMENT'
         end
       ),
       lifecycle_status = coalesce(
         lifecycle_status,
         case
           when ends_on is not null and ends_on < current_date then 'EXPIRED'
           when starts_on > current_date then 'DRAFT'
           else 'ACTIVE'
         end
       ),
       fee_basis = coalesce(
         fee_basis,
         case commission_type
           when 'FIXED_MONTHLY' then 'FIXED_MONTHLY'
           else 'PERCENTAGE_COLLECTED'
         end
       ),
       fee_trigger = coalesce(
         fee_trigger,
         case commission_type
           when 'FIXED_MONTHLY' then 'PERIOD_END'
           else 'COLLECTION'
         end
       ),
       billing_basis = coalesce(billing_basis, 'FULL_MONTH'),
       settlement_frequency = coalesce(settlement_frequency, 'MONTHLY'),
       settlement_day = coalesce(settlement_day, 5),
       reserve_amount = coalesce(reserve_amount, 0),
       expense_approval_limit = coalesce(expense_approval_limit, 0),
       maintenance_responsibility = coalesce(maintenance_responsibility, 'OWNER'),
       utilities_responsibility = coalesce(utilities_responsibility, 'TENANT'),
       taxes_responsibility = coalesce(taxes_responsibility, 'OWNER'),
       security_deposit_beneficiary = coalesce(
         security_deposit_beneficiary,
         case agreement_type when 'master_lease' then 'OFFICE' else 'OWNER' end
       ),
       settlement_requires_approval = coalesce(settlement_requires_approval, true),
       early_termination_notice_days = coalesce(early_termination_notice_days, 30),
       terms_version = coalesce(terms_version, 1),
       custom_terms = coalesce(custom_terms, '{}'::jsonb),
       activated_at = coalesce(
         activated_at,
         case when starts_on <= current_date and (ends_on is null or ends_on >= current_date) then created_at end
       );

alter table public.owner_agreements
  alter column operating_model set default 'AGENCY_MANAGEMENT',
  alter column operating_model set not null,
  alter column lifecycle_status set default 'DRAFT',
  alter column lifecycle_status set not null,
  alter column fee_basis set default 'PERCENTAGE_COLLECTED',
  alter column fee_basis set not null,
  alter column fee_trigger set default 'COLLECTION',
  alter column fee_trigger set not null,
  alter column billing_basis set default 'FULL_MONTH',
  alter column billing_basis set not null,
  alter column settlement_frequency set default 'MONTHLY',
  alter column settlement_frequency set not null,
  alter column settlement_day set default 5,
  alter column settlement_day set not null,
  alter column reserve_amount set default 0,
  alter column reserve_amount set not null,
  alter column expense_approval_limit set default 0,
  alter column expense_approval_limit set not null,
  alter column maintenance_responsibility set default 'OWNER',
  alter column maintenance_responsibility set not null,
  alter column utilities_responsibility set default 'TENANT',
  alter column utilities_responsibility set not null,
  alter column taxes_responsibility set default 'OWNER',
  alter column taxes_responsibility set not null,
  alter column security_deposit_beneficiary set default 'OWNER',
  alter column security_deposit_beneficiary set not null,
  alter column settlement_requires_approval set default true,
  alter column settlement_requires_approval set not null,
  alter column early_termination_notice_days set default 30,
  alter column early_termination_notice_days set not null,
  alter column terms_version set default 1,
  alter column terms_version set not null,
  alter column custom_terms set default '{}'::jsonb,
  alter column custom_terms set not null;

alter table public.owner_agreements drop constraint if exists owner_agreements_operating_model_check;
alter table public.owner_agreements add constraint owner_agreements_operating_model_check check (
  operating_model in ('AGENCY_MANAGEMENT', 'MASTER_LEASE', 'COLLECTION_ONLY')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_lifecycle_status_check;
alter table public.owner_agreements add constraint owner_agreements_lifecycle_status_check check (
  lifecycle_status in ('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'EXPIRED')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_fee_basis_check;
alter table public.owner_agreements add constraint owner_agreements_fee_basis_check check (
  fee_basis in ('PERCENTAGE_COLLECTED', 'PERCENTAGE_BILLED', 'FIXED_MONTHLY')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_fee_trigger_check;
alter table public.owner_agreements add constraint owner_agreements_fee_trigger_check check (
  fee_trigger in ('COLLECTION', 'INVOICE_ISSUE', 'PERIOD_END')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_billing_basis_check;
alter table public.owner_agreements add constraint owner_agreements_billing_basis_check check (
  billing_basis in ('FULL_MONTH', 'DAILY_PRORATED')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_settlement_frequency_check;
alter table public.owner_agreements add constraint owner_agreements_settlement_frequency_check check (
  settlement_frequency in ('MONTHLY', 'QUARTERLY', 'ON_DEMAND')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_settlement_day_check;
alter table public.owner_agreements add constraint owner_agreements_settlement_day_check check (
  settlement_day between 1 and 28
);
alter table public.owner_agreements drop constraint if exists owner_agreements_reserve_amount_check;
alter table public.owner_agreements add constraint owner_agreements_reserve_amount_check check (reserve_amount >= 0);
alter table public.owner_agreements drop constraint if exists owner_agreements_expense_approval_limit_check;
alter table public.owner_agreements add constraint owner_agreements_expense_approval_limit_check check (expense_approval_limit >= 0);
alter table public.owner_agreements drop constraint if exists owner_agreements_maintenance_responsibility_check;
alter table public.owner_agreements add constraint owner_agreements_maintenance_responsibility_check check (
  maintenance_responsibility in ('OWNER', 'OFFICE', 'TENANT', 'SHARED')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_utilities_responsibility_check;
alter table public.owner_agreements add constraint owner_agreements_utilities_responsibility_check check (
  utilities_responsibility in ('OWNER', 'OFFICE', 'TENANT', 'SHARED')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_taxes_responsibility_check;
alter table public.owner_agreements add constraint owner_agreements_taxes_responsibility_check check (
  taxes_responsibility in ('OWNER', 'OFFICE', 'TENANT', 'SHARED')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_deposit_beneficiary_check;
alter table public.owner_agreements add constraint owner_agreements_deposit_beneficiary_check check (
  security_deposit_beneficiary in ('OWNER', 'OFFICE', 'HELD_IN_TRUST')
);
alter table public.owner_agreements drop constraint if exists owner_agreements_notice_days_check;
alter table public.owner_agreements add constraint owner_agreements_notice_days_check check (
  early_termination_notice_days >= 0 and terms_version >= 1
);
alter table public.owner_agreements drop constraint if exists owner_agreements_model_matches_type_check;
alter table public.owner_agreements add constraint owner_agreements_model_matches_type_check check (
  (agreement_type = 'master_lease' and operating_model = 'MASTER_LEASE')
  or
  (agreement_type = 'property_management' and operating_model in ('AGENCY_MANAGEMENT', 'COLLECTION_ONLY'))
);
alter table public.owner_agreements drop constraint if exists owner_agreements_fee_matches_commission_check;
alter table public.owner_agreements add constraint owner_agreements_fee_matches_commission_check check (
  (commission_type = 'RATE' and fee_basis in ('PERCENTAGE_COLLECTED', 'PERCENTAGE_BILLED'))
  or
  (commission_type = 'FIXED_MONTHLY' and fee_basis = 'FIXED_MONTHLY')
);

comment on column public.owner_agreements.fee_trigger is
  'Business event that earns the office fee; it is not itself an accounting posting.';
comment on column public.owner_agreements.billing_basis is
  'Approved ADR 0004 basis: FULL_MONTH or DAILY_PRORATED.';
comment on column public.owner_agreements.expense_approval_limit is
  'Maximum office-authorized property expense without owner approval; zero means every expense requires approval.';

-- Business terms can only be changed by the dedicated audited RPC. Existing
-- agreement RPCs can still update relationship dates, commission and notes.
create or replace function public.guard_owner_agreement_business_terms_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
    old.operating_model,
    old.lifecycle_status,
    old.fee_basis,
    old.fee_trigger,
    old.billing_basis,
    old.settlement_frequency,
    old.settlement_day,
    old.reserve_amount,
    old.expense_approval_limit,
    old.maintenance_responsibility,
    old.utilities_responsibility,
    old.taxes_responsibility,
    old.security_deposit_beneficiary,
    old.settlement_requires_approval,
    old.early_termination_notice_days,
    old.terms_version,
    old.custom_terms,
    old.activated_at,
    old.terminated_at,
    old.termination_reason
  ) is distinct from (
    new.operating_model,
    new.lifecycle_status,
    new.fee_basis,
    new.fee_trigger,
    new.billing_basis,
    new.settlement_frequency,
    new.settlement_day,
    new.reserve_amount,
    new.expense_approval_limit,
    new.maintenance_responsibility,
    new.utilities_responsibility,
    new.taxes_responsibility,
    new.security_deposit_beneficiary,
    new.settlement_requires_approval,
    new.early_termination_notice_days,
    new.terms_version,
    new.custom_terms,
    new.activated_at,
    new.terminated_at,
    new.termination_reason
  )
  and coalesce(current_setting('app.owner_agreement_business_terms_rpc', true), '') <> 'on'
  and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'OWNER_AGREEMENT_BUSINESS_TERMS_RPC_REQUIRED'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function public.guard_owner_agreement_business_terms_update() owner to postgres;
revoke all on function public.guard_owner_agreement_business_terms_update() from public, anon, authenticated;

drop trigger if exists trg_guard_owner_agreement_business_terms_update on public.owner_agreements;
create trigger trg_guard_owner_agreement_business_terms_update
before update on public.owner_agreements
for each row execute function public.guard_owner_agreement_business_terms_update();

create or replace function public.set_owner_agreement_business_terms(
  p_agreement_id uuid,
  p_terms jsonb
)
returns public.owner_agreements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_old public.owner_agreements%rowtype;
  v_row public.owner_agreements%rowtype;
  v_operating_model text;
  v_lifecycle_status text;
  v_fee_basis text;
  v_fee_trigger text;
  v_billing_basis text;
  v_settlement_frequency text;
  v_settlement_day smallint;
  v_reserve_amount numeric(18,3);
  v_expense_approval_limit numeric(18,3);
  v_maintenance_responsibility text;
  v_utilities_responsibility text;
  v_taxes_responsibility text;
  v_security_deposit_beneficiary text;
  v_settlement_requires_approval boolean;
  v_notice_days integer;
  v_custom_terms jsonb;
begin
  if v_actor_id is null or not public.is_admin_or_manager() or v_company_id is null then
    raise exception 'غير مصرح: يحتاج هذا الإجراء صلاحية مدير أو مشرف داخل شركة.'
      using errcode = '42501';
  end if;

  select oa.*
    into v_old
    from public.owner_agreements as oa
   where oa.id = p_agreement_id
     and oa.company_id = v_company_id
   for update;

  if not found then
    raise exception 'AGREEMENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  v_operating_model := coalesce(nullif(p_terms->>'operating_model', ''), v_old.operating_model);
  v_lifecycle_status := coalesce(nullif(p_terms->>'lifecycle_status', ''), v_old.lifecycle_status);
  v_fee_basis := coalesce(nullif(p_terms->>'fee_basis', ''), v_old.fee_basis);
  v_fee_trigger := coalesce(nullif(p_terms->>'fee_trigger', ''), v_old.fee_trigger);
  v_billing_basis := coalesce(nullif(p_terms->>'billing_basis', ''), v_old.billing_basis);
  v_settlement_frequency := coalesce(nullif(p_terms->>'settlement_frequency', ''), v_old.settlement_frequency);
  v_settlement_day := coalesce(nullif(p_terms->>'settlement_day', '')::smallint, v_old.settlement_day);
  v_reserve_amount := coalesce(nullif(p_terms->>'reserve_amount', '')::numeric, v_old.reserve_amount);
  v_expense_approval_limit := coalesce(nullif(p_terms->>'expense_approval_limit', '')::numeric, v_old.expense_approval_limit);
  v_maintenance_responsibility := coalesce(nullif(p_terms->>'maintenance_responsibility', ''), v_old.maintenance_responsibility);
  v_utilities_responsibility := coalesce(nullif(p_terms->>'utilities_responsibility', ''), v_old.utilities_responsibility);
  v_taxes_responsibility := coalesce(nullif(p_terms->>'taxes_responsibility', ''), v_old.taxes_responsibility);
  v_security_deposit_beneficiary := coalesce(nullif(p_terms->>'security_deposit_beneficiary', ''), v_old.security_deposit_beneficiary);
  v_settlement_requires_approval := coalesce((p_terms->>'settlement_requires_approval')::boolean, v_old.settlement_requires_approval);
  v_notice_days := coalesce(nullif(p_terms->>'early_termination_notice_days', '')::integer, v_old.early_termination_notice_days);
  v_custom_terms := coalesce(p_terms->'custom_terms', v_old.custom_terms, '{}'::jsonb);

  if v_operating_model not in ('AGENCY_MANAGEMENT', 'MASTER_LEASE', 'COLLECTION_ONLY')
     or v_lifecycle_status not in ('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'EXPIRED')
     or v_fee_basis not in ('PERCENTAGE_COLLECTED', 'PERCENTAGE_BILLED', 'FIXED_MONTHLY')
     or v_fee_trigger not in ('COLLECTION', 'INVOICE_ISSUE', 'PERIOD_END')
     or v_billing_basis not in ('FULL_MONTH', 'DAILY_PRORATED')
     or v_settlement_frequency not in ('MONTHLY', 'QUARTERLY', 'ON_DEMAND')
     or v_settlement_day not between 1 and 28
     or v_reserve_amount < 0
     or v_expense_approval_limit < 0
     or v_notice_days < 0 then
    raise exception 'OWNER_AGREEMENT_BUSINESS_TERMS_INVALID' using errcode = '22023';
  end if;

  if (v_old.agreement_type = 'master_lease' and v_operating_model <> 'MASTER_LEASE')
     or (v_old.agreement_type = 'property_management' and v_operating_model not in ('AGENCY_MANAGEMENT', 'COLLECTION_ONLY')) then
    raise exception 'OWNER_AGREEMENT_MODEL_CONFLICT' using errcode = '22023';
  end if;

  if (v_old.commission_type = 'RATE' and v_fee_basis not in ('PERCENTAGE_COLLECTED', 'PERCENTAGE_BILLED'))
     or (v_old.commission_type = 'FIXED_MONTHLY' and v_fee_basis <> 'FIXED_MONTHLY') then
    raise exception 'OWNER_AGREEMENT_FEE_BASIS_CONFLICT' using errcode = '22023';
  end if;

  perform set_config('app.owner_agreement_business_terms_rpc', 'on', true);

  update public.owner_agreements as oa
     set operating_model = v_operating_model,
         lifecycle_status = v_lifecycle_status,
         fee_basis = v_fee_basis,
         fee_trigger = v_fee_trigger,
         billing_basis = v_billing_basis,
         settlement_frequency = v_settlement_frequency,
         settlement_day = v_settlement_day,
         reserve_amount = round(v_reserve_amount, 3),
         expense_approval_limit = round(v_expense_approval_limit, 3),
         maintenance_responsibility = v_maintenance_responsibility,
         utilities_responsibility = v_utilities_responsibility,
         taxes_responsibility = v_taxes_responsibility,
         security_deposit_beneficiary = v_security_deposit_beneficiary,
         settlement_requires_approval = v_settlement_requires_approval,
         early_termination_notice_days = v_notice_days,
         custom_terms = v_custom_terms,
         terms_version = oa.terms_version + 1,
         activated_at = case
           when v_lifecycle_status = 'ACTIVE' then coalesce(oa.activated_at, now())
           else oa.activated_at
         end,
         terminated_at = case
           when v_lifecycle_status = 'TERMINATED' then coalesce(oa.terminated_at, now())
           else null
         end,
         termination_reason = case
           when v_lifecycle_status = 'TERMINATED' then nullif(p_terms->>'termination_reason', '')
           else null
         end,
         updated_at = now()
   where oa.id = p_agreement_id
     and oa.company_id = v_company_id
   returning oa.* into v_row;

  insert into public.audit_log (
    id, ts, user_id, username, action, entity, entity_id, note, "table",
    details, action_timestamp, created_at
  ) values (
    gen_random_uuid()::text,
    extract(epoch from now())::bigint,
    v_actor_id,
    v_actor_id::text,
    'UPDATE_BUSINESS_TERMS',
    'owner_agreement',
    v_row.id::text,
    'Owner agreement business terms updated through the audited domain boundary.',
    'owner_agreements',
    jsonb_build_object(
      'company_id', v_company_id,
      'agreement_id', v_row.id,
      'old_terms_version', v_old.terms_version,
      'new_terms_version', v_row.terms_version,
      'operating_model', v_row.operating_model,
      'fee_basis', v_row.fee_basis,
      'fee_trigger', v_row.fee_trigger,
      'settlement_frequency', v_row.settlement_frequency,
      'actor_id', v_actor_id,
      'timestamp', now()
    )::text,
    now(),
    now()
  );

  return v_row;
end;
$$;

alter function public.set_owner_agreement_business_terms(uuid, jsonb) owner to postgres;
revoke all on function public.set_owner_agreement_business_terms(uuid, jsonb) from public, anon;
grant execute on function public.set_owner_agreement_business_terms(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Contract lifecycle and commercial terms
-- ---------------------------------------------------------------------------

alter table public.contracts
  add column if not exists contract_kind text,
  add column if not exists first_due_date date,
  add column if not exists billing_anchor_day smallint,
  add column if not exists payment_due_timing text,
  add column if not exists proration_basis text,
  add column if not exists security_deposit_amount numeric(18,3),
  add column if not exists brokerage_fee_amount numeric(18,3),
  add column if not exists auto_renew boolean,
  add column if not exists renewal_notice_days integer,
  add column if not exists rent_increase_rate numeric(7,4),
  add column if not exists grace_period_days integer,
  add column if not exists late_fee_type text,
  add column if not exists late_fee_value numeric(18,3),
  add column if not exists termination_notice_days integer,
  add column if not exists utilities_terms jsonb,
  add column if not exists contract_terms jsonb;

update public.contracts
   set contract_kind = coalesce(contract_kind, case when renewed_from_id is null then 'NEW' else 'RENEWAL' end),
       first_due_date = coalesce(first_due_date, start_date),
       billing_anchor_day = coalesce(billing_anchor_day, least(extract(day from start_date)::integer, 28)),
       payment_due_timing = coalesce(payment_due_timing, 'ADVANCE'),
       proration_basis = coalesce(proration_basis, 'FULL_INSTALLMENT'),
       security_deposit_amount = coalesce(security_deposit_amount, 0),
       brokerage_fee_amount = coalesce(brokerage_fee_amount, 0),
       auto_renew = coalesce(auto_renew, false),
       renewal_notice_days = coalesce(renewal_notice_days, 60),
       grace_period_days = coalesce(grace_period_days, 0),
       late_fee_type = coalesce(late_fee_type, 'NONE'),
       late_fee_value = coalesce(late_fee_value, 0),
       termination_notice_days = coalesce(termination_notice_days, 30),
       utilities_terms = coalesce(utilities_terms, '{}'::jsonb),
       contract_terms = coalesce(contract_terms, '{}'::jsonb);

alter table public.contracts
  alter column contract_kind set default 'NEW',
  alter column contract_kind set not null,
  alter column payment_due_timing set default 'ADVANCE',
  alter column payment_due_timing set not null,
  alter column proration_basis set default 'FULL_INSTALLMENT',
  alter column proration_basis set not null,
  alter column security_deposit_amount set default 0,
  alter column security_deposit_amount set not null,
  alter column brokerage_fee_amount set default 0,
  alter column brokerage_fee_amount set not null,
  alter column auto_renew set default false,
  alter column auto_renew set not null,
  alter column renewal_notice_days set default 60,
  alter column renewal_notice_days set not null,
  alter column grace_period_days set default 0,
  alter column grace_period_days set not null,
  alter column late_fee_type set default 'NONE',
  alter column late_fee_type set not null,
  alter column late_fee_value set default 0,
  alter column late_fee_value set not null,
  alter column termination_notice_days set default 30,
  alter column termination_notice_days set not null,
  alter column utilities_terms set default '{}'::jsonb,
  alter column utilities_terms set not null,
  alter column contract_terms set default '{}'::jsonb,
  alter column contract_terms set not null;

alter table public.contracts drop constraint if exists contracts_contract_kind_check;
alter table public.contracts add constraint contracts_contract_kind_check check (
  contract_kind in ('NEW', 'RENEWAL', 'AMENDMENT', 'SUBLEASE')
);
alter table public.contracts drop constraint if exists contracts_payment_due_timing_check;
alter table public.contracts add constraint contracts_payment_due_timing_check check (
  payment_due_timing in ('ADVANCE', 'ARREARS')
);
alter table public.contracts drop constraint if exists contracts_proration_basis_check;
alter table public.contracts add constraint contracts_proration_basis_check check (
  proration_basis in ('FULL_INSTALLMENT', 'DAILY_PRORATED')
);
alter table public.contracts drop constraint if exists contracts_billing_anchor_day_check;
alter table public.contracts add constraint contracts_billing_anchor_day_check check (
  billing_anchor_day is null or billing_anchor_day between 1 and 28
);
alter table public.contracts drop constraint if exists contracts_business_amounts_check;
alter table public.contracts add constraint contracts_business_amounts_check check (
  security_deposit_amount >= 0
  and brokerage_fee_amount >= 0
  and coalesce(rent_increase_rate, 0) >= 0
  and grace_period_days >= 0
  and late_fee_value >= 0
  and termination_notice_days >= 0
  and renewal_notice_days >= 0
);
alter table public.contracts drop constraint if exists contracts_late_fee_type_check;
alter table public.contracts add constraint contracts_late_fee_type_check check (
  late_fee_type in ('NONE', 'FIXED', 'RATE')
  and (late_fee_type <> 'RATE' or late_fee_value <= 100)
);
alter table public.contracts drop constraint if exists contracts_first_due_date_check;
alter table public.contracts add constraint contracts_first_due_date_check check (
  first_due_date is null or first_due_date >= start_date
);

comment on column public.contracts.rent_amount is
  'Contractual amount per payment_cycle installment. Billing schedules preserve this meaning explicitly.';
comment on column public.contracts.proration_basis is
  'FULL_INSTALLMENT preserves legacy behavior; DAILY_PRORATED only prorates a partial final contractual period.';

-- ---------------------------------------------------------------------------
-- 4. Contractual billing schedule (not invoices, not accounting)
-- ---------------------------------------------------------------------------

create table if not exists public.contract_billing_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  installment_no integer not null check (installment_no > 0),
  period_start date not null,
  period_end date not null,
  due_date date not null,
  scheduled_amount numeric(18,3) not null check (scheduled_amount >= 0),
  tax_amount numeric(18,3) not null default 0 check (tax_amount >= 0),
  other_amount numeric(18,3) not null default 0 check (other_amount >= 0),
  total_amount numeric(18,3) generated always as (
    round(scheduled_amount + tax_amount + other_amount, 3)
  ) stored,
  status text not null default 'SCHEDULED' check (
    status in ('SCHEDULED', 'INVOICED', 'PAID', 'CANCELLED')
  ),
  invoice_id uuid references public.invoices(id) on delete restrict,
  is_prorated boolean not null default false,
  source text not null default 'CONTRACT_TERMS',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_billing_schedule_dates_check check (period_end >= period_start),
  constraint contract_billing_schedule_company_installment_unique unique (company_id, contract_id, installment_no)
);

create index if not exists contract_billing_schedules_contract_due_idx
  on public.contract_billing_schedules (company_id, contract_id, due_date);
create index if not exists contract_billing_schedules_status_due_idx
  on public.contract_billing_schedules (company_id, status, due_date);

alter table public.contract_billing_schedules enable row level security;

drop policy if exists p0_tenant_isolation on public.contract_billing_schedules;
create policy p0_tenant_isolation
  on public.contract_billing_schedules
  as restrictive
  for all
  to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists contract_billing_schedules_read on public.contract_billing_schedules;
create policy contract_billing_schedules_read
  on public.contract_billing_schedules
  for select
  to authenticated
  using (public.is_app_user());

revoke all on table public.contract_billing_schedules from public, anon, authenticated;
grant select on table public.contract_billing_schedules to authenticated;
grant select, insert, update, delete on table public.contract_billing_schedules to service_role;

create or replace function public.guard_materialized_contract_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and old.status in ('INVOICED', 'PAID') then
    raise exception 'MATERIALIZED_CONTRACT_SCHEDULE_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('INVOICED', 'PAID')
     and new is distinct from old then
    raise exception 'MATERIALIZED_CONTRACT_SCHEDULE_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

alter function public.guard_materialized_contract_schedule() owner to postgres;
revoke all on function public.guard_materialized_contract_schedule() from public, anon, authenticated;

drop trigger if exists trg_guard_materialized_contract_schedule on public.contract_billing_schedules;
create trigger trg_guard_materialized_contract_schedule
before update or delete on public.contract_billing_schedules
for each row execute function public.guard_materialized_contract_schedule();

create or replace function public.contract_cycle_date(
  p_contract_start date,
  p_month_offset integer,
  p_anchor_day integer
)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_month_start date;
  v_last_day integer;
begin
  if p_contract_start is null or p_month_offset < 0 or p_anchor_day not between 1 and 28 then
    raise exception 'CONTRACT_CYCLE_DATE_INVALID' using errcode = '22023';
  end if;
  v_month_start := (date_trunc('month', p_contract_start)::date + make_interval(months => p_month_offset))::date;
  v_last_day := extract(day from (v_month_start + interval '1 month - 1 day'))::integer;
  return v_month_start + (least(p_anchor_day, v_last_day) - 1);
end;
$$;

alter function public.contract_cycle_date(date, integer, integer) owner to postgres;
revoke all on function public.contract_cycle_date(date, integer, integer) from public, anon;
grant execute on function public.contract_cycle_date(date, integer, integer) to authenticated, service_role;

create or replace function public.materialize_contract_billing_schedule(
  p_contract_id uuid,
  p_replace_scheduled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_contract public.contracts%rowtype;
  v_property_operating_model text;
  v_agreement public.owner_agreements%rowtype;
  v_cycle_months integer;
  v_anchor_day integer;
  v_offset integer := 0;
  v_installment_no integer := 0;
  v_period_start date;
  v_next_period_start date;
  v_nominal_period_end date;
  v_period_end date;
  v_due_date date;
  v_amount numeric(18,3);
  v_is_prorated boolean;
  v_existing_count integer;
  v_count integer;
  v_total numeric(18,3);
begin
  if v_actor_id is null or not public.is_admin_or_manager() or v_company_id is null then
    raise exception 'غير مصرح: يحتاج هذا الإجراء صلاحية مدير أو مشرف داخل شركة.'
      using errcode = '42501';
  end if;

  select c.*
    into v_contract
    from public.contracts as c
   where c.id = p_contract_id
     and c.company_id = v_company_id
     and c.deleted_at is null
   for update;

  if not found then
    raise exception 'CONTRACT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select p.operating_model
    into v_property_operating_model
    from public.properties as p
   where p.id::text = v_contract.property_id::text
     and p.company_id = v_company_id
     and p.deleted_at is null;

  if v_property_operating_model is null then
    raise exception 'CONTRACT_PROPERTY_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if v_contract.agreement_id is not null then
    select oa.*
      into v_agreement
      from public.owner_agreements as oa
     where oa.id = v_contract.agreement_id
       and oa.company_id = v_company_id
       and oa.property_id::text = v_contract.property_id::text
       and oa.starts_on <= v_contract.start_date
       and (oa.ends_on is null or oa.ends_on >= v_contract.end_date)
       and oa.lifecycle_status in ('ACTIVE', 'DRAFT');
  end if;

  if v_property_operating_model not in ('OFFICE_OWNED', 'BROKERAGE_ONLY')
     and v_agreement.id is null then
    raise exception 'CONTRACT_AGREEMENT_REQUIRED_FOR_OPERATING_MODEL'
      using errcode = '23514';
  end if;

  select count(*)
    into v_existing_count
    from public.contract_billing_schedules as s
   where s.company_id = v_company_id
     and s.contract_id = p_contract_id;

  if v_existing_count > 0 and not p_replace_scheduled then
    select count(*), coalesce(round(sum(s.total_amount), 3), 0)
      into v_count, v_total
      from public.contract_billing_schedules as s
     where s.company_id = v_company_id
       and s.contract_id = p_contract_id;
    return jsonb_build_object(
      'contract_id', p_contract_id,
      'existing', true,
      'installment_count', v_count,
      'scheduled_total', v_total
    );
  end if;

  if p_replace_scheduled and exists (
    select 1
      from public.contract_billing_schedules as s
     where s.company_id = v_company_id
       and s.contract_id = p_contract_id
       and s.status <> 'SCHEDULED'
  ) then
    raise exception 'CONTRACT_SCHEDULE_ALREADY_CONSUMED';
  end if;

  if p_replace_scheduled then
    delete from public.contract_billing_schedules as s
     where s.company_id = v_company_id
       and s.contract_id = p_contract_id
       and s.status = 'SCHEDULED';
  end if;

  v_cycle_months := case v_contract.payment_cycle
    when 'monthly' then 1
    when 'quarterly' then 3
    when 'semi_annual' then 6
    when 'annual' then 12
    else null
  end;
  if v_cycle_months is null then
    raise exception 'CONTRACT_PAYMENT_CYCLE_UNSUPPORTED' using errcode = '22023';
  end if;

  v_anchor_day := coalesce(v_contract.billing_anchor_day, least(extract(day from v_contract.start_date)::integer, 28));

  while public.contract_cycle_date(v_contract.start_date, v_offset, v_anchor_day) <= v_contract.end_date loop
    v_installment_no := v_installment_no + 1;
    v_period_start := public.contract_cycle_date(v_contract.start_date, v_offset, v_anchor_day);
    if v_installment_no = 1 then
      v_period_start := v_contract.start_date;
    end if;
    v_next_period_start := public.contract_cycle_date(v_contract.start_date, v_offset + v_cycle_months, v_anchor_day);
    v_nominal_period_end := v_next_period_start - 1;
    v_period_end := least(v_nominal_period_end, v_contract.end_date);
    v_is_prorated := v_period_end < v_nominal_period_end and v_contract.proration_basis = 'DAILY_PRORATED';

    if v_is_prorated then
      v_amount := round(
        v_contract.rent_amount::numeric
        * ((v_period_end - v_period_start + 1)::numeric / (v_nominal_period_end - v_period_start + 1)::numeric),
        3
      );
    else
      v_amount := round(v_contract.rent_amount::numeric, 3);
    end if;

    v_due_date := case
      when v_installment_no = 1 then coalesce(v_contract.first_due_date, v_period_start)
      when v_contract.payment_due_timing = 'ARREARS' then v_period_end
      else v_period_start
    end;

    insert into public.contract_billing_schedules (
      company_id,
      contract_id,
      installment_no,
      period_start,
      period_end,
      due_date,
      scheduled_amount,
      status,
      is_prorated,
      created_by
    ) values (
      v_company_id,
      p_contract_id,
      v_installment_no,
      v_period_start,
      v_period_end,
      v_due_date,
      v_amount,
      'SCHEDULED',
      v_is_prorated,
      v_actor_id
    );

    v_offset := v_offset + v_cycle_months;
  end loop;

  select count(*), coalesce(round(sum(s.total_amount), 3), 0)
    into v_count, v_total
    from public.contract_billing_schedules as s
   where s.company_id = v_company_id
     and s.contract_id = p_contract_id;

  return jsonb_build_object(
    'contract_id', p_contract_id,
    'existing', false,
    'installment_count', v_count,
    'scheduled_total', v_total,
    'operating_model', coalesce(v_agreement.operating_model, v_property_operating_model),
    'creditor_role', case
      when coalesce(v_agreement.operating_model, v_property_operating_model) = 'MASTER_LEASE' then 'OFFICE_IS_CREDITOR'
      else 'OWNER_IS_CREDITOR'
    end
  );
end;
$$;

alter function public.materialize_contract_billing_schedule(uuid, boolean) owner to postgres;
revoke all on function public.materialize_contract_billing_schedule(uuid, boolean) from public, anon;
grant execute on function public.materialize_contract_billing_schedule(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Read models: one business context for property and contract
-- ---------------------------------------------------------------------------

create or replace view public.current_property_business_model
with (security_invoker = true)
as
select
  p.id as property_id,
  p.company_id,
  p.operating_model as configured_operating_model,
  coalesce(
    case oa.agreement_type when 'master_lease' then 'MASTER_LEASE' else oa.operating_model end,
    p.operating_model
  ) as operating_model,
  oa.id as agreement_id,
  oa.owner_id,
  oa.lifecycle_status as agreement_status,
  oa.fee_basis,
  oa.fee_trigger,
  oa.billing_basis,
  oa.settlement_frequency,
  oa.settlement_day,
  oa.maintenance_responsibility,
  oa.utilities_responsibility,
  oa.taxes_responsibility,
  oa.security_deposit_beneficiary,
  case
    when coalesce(oa.operating_model, p.operating_model) = 'MASTER_LEASE' then 'PRINCIPAL'
    else 'AGENT'
  end as accounting_presentation,
  case
    when coalesce(oa.operating_model, p.operating_model) = 'MASTER_LEASE' then 'OFFICE_IS_CREDITOR'
    else 'OWNER_IS_CREDITOR'
  end as collection_creditor_role
from public.properties as p
left join lateral (
  select agreement.*
    from public.owner_agreements as agreement
   where agreement.property_id::text = p.id::text
     and agreement.company_id = p.company_id
     and agreement.starts_on <= current_date
     and (agreement.ends_on is null or agreement.ends_on >= current_date)
     and agreement.lifecycle_status in ('ACTIVE', 'DRAFT')
   order by
     case agreement.lifecycle_status when 'ACTIVE' then 0 else 1 end,
     agreement.starts_on desc,
     agreement.created_at desc
   limit 1
) as oa on true
where p.deleted_at is null;

grant select on public.current_property_business_model to authenticated, service_role;

create or replace function public.resolve_contract_business_context(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_context record;
begin
  if auth.uid() is null or not public.is_app_user() or v_company_id is null then
    raise exception 'غير مصرح' using errcode = '42501';
  end if;

  select
    c.id as contract_id,
    c.property_id,
    c.agreement_id,
    c.contract_kind,
    c.payment_cycle,
    c.payment_due_timing,
    c.proration_basis,
    m.operating_model,
    m.accounting_presentation,
    m.collection_creditor_role,
    m.fee_basis,
    m.fee_trigger,
    m.security_deposit_beneficiary
    into v_context
    from public.contracts as c
    join public.current_property_business_model as m
      on m.property_id::text = c.property_id::text
     and m.company_id = c.company_id
   where c.id = p_contract_id
     and c.company_id = v_company_id
     and c.deleted_at is null;

  if not found then
    raise exception 'CONTRACT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  return to_jsonb(v_context);
end;
$$;

alter function public.resolve_contract_business_context(uuid) owner to postgres;
revoke all on function public.resolve_contract_business_context(uuid) from public, anon;
grant execute on function public.resolve_contract_business_context(uuid) to authenticated, service_role;

comment on function public.materialize_contract_billing_schedule(uuid, boolean) is
  'Creates contractual installments only. It never creates invoices or accounting entries.';
comment on function public.resolve_contract_business_context(uuid) is
  'Canonical business context used by later accounting stages to choose AGENT/PRINCIPAL and creditor behavior.';

commit;
