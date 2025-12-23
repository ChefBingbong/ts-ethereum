#!/bin/bash

# Copy vitest.config.mjs from packages/block/ to all other packages
# Run this script from the monorepo root

SOURCE_FILE="packages/block/vitest.config.mjs"
PACKAGES_DIR="packages"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "❌ Source file not found: ${SOURCE_FILE}"
    exit 1
fi

echo "📋 Copying vitest.config.mjs to all packages..."

# Count packages for progress
TOTAL=$(find "$PACKAGES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
COUNT=0

# Loop through all packages
for package_dir in "$PACKAGES_DIR"/*/; do
    package_name=$(basename "$package_dir")
    
    # Skip the block package (source)
    if [ "$package_name" = "block" ]; then
        continue
    fi
    
    COUNT=$((COUNT + 1))
    dest_file="${package_dir}vitest.config.mjs"
    
    cp "$SOURCE_FILE" "$dest_file"
    echo "✅ [${COUNT}/${TOTAL}] Copied to packages/${package_name}/vitest.config.mjs"
done

echo "🎉 Done! Copied vitest.config.mjs to $COUNT packages."

