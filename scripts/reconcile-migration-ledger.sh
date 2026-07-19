#!/bin/bash

# Migration Ledger Reconciliation Script
# Verifies that repository migrations match production ledger

set -e

echo "🔍 Starting Migration Ledger Reconciliation..."
echo ""

PROJECT_ID="${SUPABASE_PROJECT_ID:-nnggcnpcuomwfuupupwg}"
DB_URL="${SUPABASE_DB_URL}"
MIGRATIONS_DIR="supabase/migrations"

if [ -z "$DB_URL" ]; then
  echo "❌ Error: SUPABASE_DB_URL not set"
  exit 1
fi

echo "📦 Project ID: $PROJECT_ID"
echo "📂 Migrations directory: $MIGRATIONS_DIR"
echo ""

# ============================================================================
# 1. Extract repository versions
# ============================================================================
echo "📋 Repository Migrations:"
echo ""

REPO_VERSIONS=()
while IFS= read -r file; do
  if [ -f "$file" ]; then
    version=$(basename "$file" | cut -d_ -f1)
    repo_versions+=("$version")
    echo "  - $version: $(basename "$file")"
  fi
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort)

echo ""

# ============================================================================
# 2. Extract production ledger versions
# ============================================================================
echo "📋 Production Ledger Migrations:"
echo ""

LEDGER_VERSIONS=()
psql "$DB_URL" -t -c "
  SELECT version || ': ' || name
  FROM supabase_migrations.schema_migrations
  ORDER BY version
" | while read -r line; do
  if [ ! -z "$line" ]; then
    echo "  - $line"
    version=$(echo "$line" | cut -d: -f1)
    ledger_versions+=("$version")
  fi
done

echo ""

# ============================================================================
# 3. Find differences
# ============================================================================
echo "🔎 Reconciliation Results:"
echo ""

# Versions in repo but not in ledger
echo "Versions in repository but NOT in ledger:"
REPO_MISSING_FROM_LEDGER=0
for version in "${repo_versions[@]}"; do
  if ! psql "$DB_URL" -t -c "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$version'" | grep -q 1; then
    echo "  ⚠️  $version (needs migration repair)"
    ((REPO_MISSING_FROM_LEDGER++))
  fi
done

if [ $REPO_MISSING_FROM_LEDGER -eq 0 ]; then
  echo "  ✅ None - all repo migrations are in ledger"
fi

echo ""

# Versions in ledger but not in repo
echo "Versions in ledger but NOT in repository:"
LEDGER_MISSING_FROM_REPO=0
psql "$DB_URL" -t -c "
  SELECT version
  FROM supabase_migrations.schema_migrations
  ORDER BY version
" | while read -r version; do
  if [ ! -z "$version" ]; then
    if [ ! -f "$MIGRATIONS_DIR/${version}_*.sql" ]; then
      echo "  ⚠️  $version (needs stub file)"
      ((LEDGER_MISSING_FROM_REPO++))
    fi
  fi
done

echo ""

# ============================================================================
# 4. Validate migration consistency
# ============================================================================
echo "✔️  Validation Checks:"
echo ""

# Check for immutability (committed migrations should not be edited)
echo "Checking for edited migrations..."
git diff --name-only "$MIGRATIONS_DIR" 2>/dev/null | while read -r file; do
  if grep -q "migrations" <<< "$file"; then
    echo "  ⚠️  $file has uncommitted changes"
  fi
done

# Check for deleted migrations
echo "Checking for deleted migrations..."
git log --diff-filter=D --summary "$MIGRATIONS_DIR" 2>/dev/null | grep "delete mode" | while read -r line; do
  echo "  ⚠️  Deleted: $line"
done

echo ""
echo "✅ Reconciliation complete!"
echo ""

if [ $REPO_MISSING_FROM_LEDGER -gt 0 ] || [ $LEDGER_MISSING_FROM_REPO -gt 0 ]; then
  echo "⚠️  Action Required: See above for reconciliation steps"
  exit 1
else
  echo "✅ Repository and production ledger are synchronized!"
  exit 0
fi
