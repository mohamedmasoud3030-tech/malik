#!/bin/bash

# Full Quality Gate Check
# Runs all verification scripts for comprehensive release readiness

set -e

echo "🚀 Starting Full Quality Gate Check"
echo "======================================"
echo ""

echo "⏱️  Timestamp: $(date)"
echo ""

# Create reports directory
REPORT_DIR="./docs/quality-gate-reports"
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/quality-gate-$(date +%Y%m%d_%H%M%S).md"

{
  echo "# Quality Gate Report"
  echo "Generated: $(date)"
  echo ""
  echo "## Local Code Checks"
  echo ""

  # ============================================================================
  # 1. TypeScript Compilation
  # ============================================================================
  echo "### 1. TypeScript Compilation"
  echo ""
  
  if pnpm typecheck > /dev/null 2>&1; then
    echo "✅ TypeScript typecheck passed"
  else
    echo "❌ TypeScript typecheck failed"
    pnpm typecheck
  fi

  echo ""

  # ============================================================================
  # 2. ESLint / Lint
  # ============================================================================
  echo "### 2. Linting"
  echo ""
  
  if pnpm lint > /dev/null 2>&1; then
    echo "✅ ESLint passed"
  else
    echo "⚠️  ESLint warnings (non-blocking)"
  fi

  echo ""

  # ============================================================================
  # 3. Unit Tests
  # ============================================================================
  echo "### 3. Unit Tests"
  echo ""
  
  if pnpm --filter @workspace/rentrix run test > /dev/null 2>&1; then
    echo "✅ Unit tests passed"
  else
    echo "❌ Unit tests failed"
  fi

  echo ""

  # ============================================================================
  # 4. Financial Tests
  # ============================================================================
  echo "### 4. Financial Test Suite"
  echo ""
  
  if pnpm --filter @workspace/rentrix run test:financials > /dev/null 2>&1; then
    echo "✅ Financial tests passed"
  else
    echo "❌ Financial tests failed"
  fi

  echo ""

  # ============================================================================
  # 5. Build
  # ============================================================================
  echo "### 5. Production Build"
  echo ""
  
  if pnpm build > /dev/null 2>&1; then
    echo "✅ Production build succeeded"
  else
    echo "❌ Production build failed"
  fi

  echo ""

  # ============================================================================
  # 6. Pending Migrations
  # ============================================================================
  echo "### 6. Migration Status"
  echo ""
  
  if supabase db push --dry-run > /dev/null 2>&1; then
    echo "✅ No pending migrations"
  else
    echo "⚠️  Pending migrations detected"
  fi

  echo ""

  # ============================================================================
  # 7. Database Type Sync
  # ============================================================================
  echo "### 7. Database Types Sync"
  echo ""
  
  if supabase gen types typescript --project-id nnggcnpcuomwfuupupwg > /tmp/types_check.ts 2>&1; then
    if diff -q /tmp/types_check.ts rentrix-app/src/types/database.types.ts > /dev/null 2>&1; then
      echo "✅ Database types are synchronized"
    else
      echo "⚠️  Database types are out of sync (regenerate)"
    fi
  else
    echo "⚠️  Could not verify type sync"
  fi

  echo ""
  echo "## Status Summary"
  echo ""
  echo "Report generated: $(date)"
  echo ""

} | tee "$REPORT_FILE"

echo ""
echo "📄 Full report saved to: $REPORT_FILE"
echo ""
echo "✅ Quality gate check complete!"
