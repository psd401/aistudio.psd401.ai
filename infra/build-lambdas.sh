#!/bin/bash

# Exit on error
set -e

echo "Building Lambda functions..."

# Compile TypeScript files with strict settings
echo "Compiling TypeScript..."
npx tsc lambdas/file-processor/index.ts --outDir lambdas/file-processor --lib es2022 --target es2022 --module commonjs --esModuleInterop --strict
npx tsc lambdas/url-processor/index.ts --outDir lambdas/url-processor --lib es2022 --target es2022 --module commonjs --esModuleInterop --strict

# Install dependencies for file-processor
echo "Installing dependencies for file-processor..."
cd lambdas/file-processor
npm install --production
cd ../..

# Install dependencies for url-processor
echo "Installing dependencies for url-processor..."
cd lambdas/url-processor
npm install --production
cd ../..

# Create processing layer
echo "Creating processing layer..."
mkdir -p layers/processing/nodejs
cd layers/processing/nodejs
npm init -y
npm install pdf-parse mammoth xlsx csv-parse marked cheerio node-fetch @types/node-fetch
cd ../../..

echo "Lambda build complete!"