#!/bin/bash
# Rebuild the product-code bundle the compiler depends on. Run after ANY
# change to src/store/context-builder.ts, src/utils.ts or their imports —
# a stale bundle silently compiles with old product logic.
cd "$(dirname "$0")/../.."
./node_modules/.bin/esbuild benchmark/tools/entry.ts --bundle --format=esm --platform=node \
  --outfile=benchmark/tools/ctx-builder.bundle.mjs \
  "--define:import.meta.env.VITE_API_BASE=\"\"" --define:import.meta.env.DEV=false
echo "bundle rebuilt from current product source"
