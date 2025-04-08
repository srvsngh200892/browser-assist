#!/bin/bash

# Script to fix Playwright WebKit installation specifically for version 1983
# This script fixes the "Browser not properly initialized for screenshot, using fallback" error

echo "=== Playwright WebKit Specific Version Fix ==="
echo "This script will install the correct version of WebKit for your project"
echo

# Change to the project directory
cd "$(dirname "$0")"
echo "Working directory: $(pwd)"

# Install the UI dependencies if needed
if [ ! -d "ui/node_modules/playwright-webkit" ]; then
  echo "Installing playwright-webkit in the UI directory..."
  cd ui
  npm install playwright-webkit
  cd ..
fi

# Install the specific version globally, which gets cached
echo "Installing Playwright WebKit globally..."
npm install -g playwright-webkit

# List current browser installations
echo "Checking current installations..."
find "$HOME/Library/Caches/ms-playwright" -type d -name "webkit-*" 2>/dev/null || echo "No WebKit installations found in user cache"

# Force reinstall the browser binaries
echo "Installing WebKit browser binaries..."
cd ui
npx playwright install webkit --force
cd ..

# Check if the installation was successful
echo "Verifying installation..."
WEBKIT_DIRS=$(find "$HOME/Library/Caches/ms-playwright" -type d -name "webkit-*" 2>/dev/null)
if [ -n "$WEBKIT_DIRS" ]; then
  echo "✅ WebKit installation directories found:"
  echo "$WEBKIT_DIRS"
  
  # Look for the pw_run.sh file
  echo "Checking for executable files..."
  for dir in $WEBKIT_DIRS; do
    if [ -f "$dir/pw_run.sh" ]; then
      echo "✅ Found executable at: $dir/pw_run.sh"
      # Make sure it's executable
      chmod +x "$dir/pw_run.sh"
      echo "Made executable: $dir/pw_run.sh"
    else
      echo "❌ Missing executable at: $dir/pw_run.sh"
    fi
  done
else
  echo "❌ No WebKit installation directories found"
fi

# Fix file permissions
echo "Fixing file permissions..."
find "$HOME/Library/Caches/ms-playwright" -name "*.sh" -exec chmod +x {} \; 2>/dev/null
echo "Permissions fixed for all .sh files"

# For debugging, print the PLAYWRIGHT_BROWSERS_PATH environment variable
echo "PLAYWRIGHT_BROWSERS_PATH is currently set to:"
echo "${PLAYWRIGHT_BROWSERS_PATH:-not set}"
