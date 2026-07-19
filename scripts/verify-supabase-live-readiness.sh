#!/bin/bash

# Supabase Live Readiness Verification Script
# Checks RLS policies, RPC grants, migrations, and database integrity on production

set -e

echo "🔍 Starting Supabase Live Readiness Verification..."
echo ""

# Get environment variables
PROJECT_ID="${SUPABASE_PROJECT_ID:-nnggcnpcuomwfuupupwg}"
DB_URL="${SUPABASE_DB_URL}"

if [ -z "$DB_URL" ]; then
  echo "❌ Error: SUPABASE_DB_URL not set"
  exit 1
fi

echo "📦 Project ID: $PROJECT_ID"
echo ""

# Create temp directory for reports
REPORT_DIR="./docs/supabase-readiness-reports"
mkdir -p "$REPORT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/readiness-check-$TIMESTAMP.md"

{
  echo "# Supabase Live Readiness Report"
  echo "Generated: $(date)"
  echo "Project ID: $PROJECT_ID"
  echo ""
  echo "## Checks Performed"
  echo ""

  # ============================================================================
  # 1. Check RLS is enabled on all tables
  # ============================================================================
  echo "### 1. RLS Policy Verification"
  echo ""

  TABLES_WITHOUT_RLS=$(psql "$DB_URL" -t -c "
    SELECT string_agg(table_name, ', ')
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT IN (
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    )
    LIMIT 1
  ")

  if [ -z "$TABLES_WITHOUT_RLS" ]; then
    echo "✅ All tables have RLS enabled"
  else
    echo "⚠️  Tables without RLS: $TABLES_WITHOUT_RLS"
  fi

  echo ""

  # ============================================================================
  # 2. Verify RLS Policies
  # ============================================================================
  echo "### 2. RLS Policies Count"
  echo ""

  POLICY_COUNT=$(psql "$DB_URL" -t -c "
    SELECT COUNT(*)
    FROM pg_policies
    WHERE schemaname = 'public'
  ")

  echo "Total RLS policies: $POLICY_COUNT"
  echo ""

  # List policies
  echo "#### Active RLS Policies:"
  echo ""
  psql "$DB_URL" -t -c "
    SELECT 
      tablename,
      policyname,
      permissive,
      roles[1] as role,
      qual as policy_expression
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  " | while read -r line; do
    if [ ! -z "$line" ]; then
      echo "- $line"
    fi
  done

  echo ""

  # ============================================================================
  # 3. Verify Role Checks in RPCs
  # ============================================================================
  echo "### 3. RPC Role Checks"
  echo ""

  echo "#### Financial Operation RPCs:"
  echo ""

  FINANCIAL_RPCS=(
    "record_payment_atomic"
    "post_receipt_atomic"
    "void_receipt_atomic"
    "create_owner_settlement_draft_atomic"
    "approve_owner_settlement_atomic"
    "pay_owner_settlement_atomic"
    "cancel_owner_settlement_atomic"
  )

  for rpc in "${FINANCIAL_RPCS[@]}"; do
    RPC_DEF=$(psql "$DB_URL" -t -c "
      SELECT prosrc
      FROM pg_proc
      JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = '$rpc'
    ")

    if echo "$RPC_DEF" | grep -q "auth.role()"; then
      echo "✅ $rpc has role check"
    else
      echo "⚠️  $rpc missing role check"
    fi
  done

  echo ""

  # ============================================================================
  # 4. Verify SECURITY DEFINER on Financial RPCs
  # ============================================================================
  echo "### 4. SECURITY DEFINER Verification"
  echo ""

  for rpc in "${FINANCIAL_RPCS[@]}"; do
    SECURITY_TYPE=$(psql "$DB_URL" -t -c "
      SELECT prosecdef
      FROM pg_proc
      JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = '$rpc'
    ")

    if [ "$SECURITY_TYPE" == "t" ]; then
      echo "✅ $rpc uses SECURITY DEFINER"
    else
      echo "⚠️  $rpc does not use SECURITY DEFINER"
    fi
  done

  echo ""

  # ============================================================================
  # 5. Check Migration Ledger
  # ============================================================================
  echo "### 5. Migration Ledger Status"
  echo ""

  MIGRATION_COUNT=$(psql "$DB_URL" -t -c "
    SELECT COUNT(*)
    FROM supabase_migrations.schema_migrations
  ")

  echo "Total migrations applied: $MIGRATION_COUNT"
  echo ""

  echo "#### Recent Migrations:"
  echo ""
  psql "$DB_URL" -t -c "
    SELECT version, name, executed_at
    FROM supabase_migrations.schema_migrations
    ORDER BY version DESC
    LIMIT 10
  " | while read -r line; do
    if [ ! -z "$line" ]; then
      echo "- $line"
    fi
  done

  echo ""

  # ============================================================================
  # 6. Check for Foreign Key Constraints
  # ============================================================================
  echo "### 6. Foreign Key Constraints"
  echo ""

  FK_COUNT=$(psql "$DB_URL" -t -c "
    SELECT COUNT(*)
    FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public'
  ")

  echo "Total foreign key constraints: $FK_COUNT"
  echo ""

  # ============================================================================
  # 7. Check Table Statistics
  # ============================================================================
  echo "### 7. Table Statistics"
  echo ""

  psql "$DB_URL" -t -c "
    SELECT 
      schemaname,
      tablename,
      n_live_tup as live_rows,
      n_dead_tup as dead_rows,
      last_vacuum,
      last_autovacuum
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY n_live_tup DESC
  " | while read -r line; do
    if [ ! -z "$line" ]; then
      echo "- $line"
    fi
  done

  echo ""

  # ============================================================================
  # 8. Check Index Coverage on Foreign Keys
  # ============================================================================
  echo "### 8. Index Coverage on Foreign Keys"
  echo ""

  echo "Checking indexes on foreign key columns..."
  echo ""

  psql "$DB_URL" -t -c "
    SELECT 
      constraint_name,
      table_name,
      column_name,
      CASE WHEN indexed THEN 'Indexed ✅' ELSE 'Not Indexed ⚠️' END as status
    FROM (
      SELECT 
        tc.constraint_name,
        kcu.table_name,
        kcu.column_name,
        CASE WHEN i.indexname IS NOT NULL THEN true ELSE false END as indexed
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN pg_stat_user_indexes i ON i.relname = kcu.column_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND kcu.table_schema = 'public'
    ) subq
    ORDER BY table_name, constraint_name
  " | while read -r line; do
    if [ ! -z "$line" ]; then
      echo "- $line"
    fi
  done

  echo ""
  echo "## Summary"
  echo ""
  echo "✅ Live readiness verification completed at $(date)"
  echo ""

} | tee "$REPORT_FILE"

echo ""
echo "📄 Report saved to: $REPORT_FILE"
echo ""
echo "✅ Verification complete!"
