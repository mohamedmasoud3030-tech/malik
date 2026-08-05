-- Manual rollback for 20260805010000_business_model_contract_foundation.sql
--
-- Safety policy: contractual terms already captured on properties, agreements,
-- and contracts are retained. Dropping those columns would destroy business
-- meaning and is therefore intentionally not automated. This rollback removes
-- the executable/read-model layer and drops the schedule table only when no
-- schedule has been consumed by invoicing or payment.

begin;

do $$
begin
  if to_regclass('public.contract_billing_schedules') is not null
     and exists (
       select 1
         from public.contract_billing_schedules
        where status in ('INVOICED', 'PAID')
           or invoice_id is not null
     ) then
    raise exception 'ROLLBACK_BLOCKED_CONTRACT_SCHEDULE_ALREADY_CONSUMED';
  end if;
end;
$$;

drop function if exists public.resolve_contract_business_context(uuid);
drop view if exists public.current_property_business_model;
drop function if exists public.materialize_contract_billing_schedule(uuid, boolean);
drop function if exists public.contract_cycle_date(date, integer, integer);

drop trigger if exists trg_guard_materialized_contract_schedule on public.contract_billing_schedules;
drop function if exists public.guard_materialized_contract_schedule();
drop table if exists public.contract_billing_schedules;

drop function if exists public.set_owner_agreement_business_terms(uuid, jsonb);
drop trigger if exists trg_guard_owner_agreement_business_terms_update on public.owner_agreements;
drop function if exists public.guard_owner_agreement_business_terms_update();

-- Additive property/agreement/contract columns and their data are retained.
-- They are backward-compatible and must be removed only after an explicit data
-- export and a separately reviewed destructive migration.

commit;
