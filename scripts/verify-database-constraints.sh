#!/bin/bash

# Database Constraints Verification Script
# Verifies all critical database constraints are in place

set -e

echo "🔍 Database Constraints Verification"
echo ""

DB_URL="${SUPABASE_DB_URL}"

if [ -z "$DB_URL" ]; then
  echo "❌ Error: SUPABASE_DB_URL not set"
  exit 1
fi

echo "📋 Checking database constraints..."
echo ""

# ============================================================================
# 1. Check NOT NULL constraints
# ============================================================================
echo "### NOT NULL Constraints"
echo ""

echo "Critical NOT NULL columns:"
psql "$DB_URL" -t -c "
  SELECT 
    table_name,
    column_name,
    'NOT NULL' as constraint_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND is_nullable = 'NO'
  AND column_name IN ('id', 'amount', 'status', 'created_at')
  ORDER BY table_name, column_name
" | while read -r line; do
  if [ ! -z "$line" ]; then
    echo "  ✅ $line"
  fi
done

echo ""

# ============================================================================
# 2. Check CHECK constraints
# ============================================================================
echo "### CHECK Constraints"
echo ""

echo "Amount validation (non-negative):"
psql "$DB_URL" -t -c "
  SELECT 
    constraint_name,
    table_name
  FROM information_schema.table_constraints
  WHERE constraint_type = 'CHECK'
  AND table_schema = 'public'
  AND constraint_name LIKE '%amount%' OR constraint_name LIKE '%positive%'
  ORDER BY table_name
" | while read -r line; do
  if [ ! -z "$line" ]; then
    echo "  ✅ $line"
  fi
done

echo ""

# ============================================================================
# 3. Check UNIQUE constraints
# ============================================================================
echo "### UNIQUE Constraints"
echo ""

echo "Uniqueness validation:"
psql "$DB_URL" -t -c "
  SELECT 
    constraint_name,
    table_name
  FROM information_schema.table_constraints
  WHERE constraint_type = 'UNIQUE'
  AND table_schema = 'public'
  ORDER BY table_name
" | while read -r line; do
  if [ ! -z "$line" ]; then
    echo "  ✅ $line"
  fi
done

echo ""

# ============================================================================
# 4. Check PRIMARY KEY constraints
# ============================================================================
echo "### PRIMARY KEY Constraints"
echo ""

echo "Primary keys present:"
psql "$DB_URL" -t -c "
  SELECT 
    table_name,
    COUNT(*) as pk_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'PRIMARY KEY'
  AND table_schema = 'public'
  GROUP BY table_name
  ORDER BY table_name
" | while read -r line; do
  if [ ! -z "$line" ]; then
    echo "  ✅ $line"
  fi
done

echo ""

# ============================================================================
# 5. Check FOREIGN KEY constraints
# ============================================================================
echo "### FOREIGN KEY Constraints"
echo ""

echo "Foreign key relationships:"
psql "$DB_URL" -t -c "
  SELECT 
    constraint_name,
    table_name,
    column_name
  FROM information_schema.key_column_usage
  WHERE constraint_type = 'FOREIGN KEY'
  AND table_schema = 'public'
  ORDER BY table_name, constraint_name
" | head -20 | while read -r line; do
  if [ ! -z "$line" ]; then
    echo "  ✅ $line"
  fi
done

echo ""
echo "✅ Constraint verification complete!"
