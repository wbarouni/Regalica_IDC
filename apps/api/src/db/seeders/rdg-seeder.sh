#!/bin/bash
# Run the RDG XLSX seeder from the project root.
# Usage: bash apps/api/src/db/seeders/rdg-seeder.sh
set -euo pipefail

# Resolve project root (4 levels up from this script's directory)
cd "$(dirname "$0")/../../../.."

echo "[rdg-seeder.sh] Project root: $(pwd)"
echo "[rdg-seeder.sh] Starting seeder..."

npx tsx apps/api/src/db/seeders/rdg-seeder.ts
