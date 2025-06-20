#!/bin/bash

# Example OAuth2 Environment Variables
# IMPORTANT: Replace these with your actual OAuth2 credentials

# Check if required environment variables are set
if [ -z "$EXAMPLE_CLIENT_ID" ]; then
  echo "❌ EXAMPLE_CLIENT_ID is not set!"
  echo "Please export your OAuth2 credentials:"
  echo "export EXAMPLE_CLIENT_ID=\"your_actual_client_id\""
  echo "export EXAMPLE_CLIENT_SECRET=\"your_actual_client_secret\""
  echo "export EXAMPLE_APP_REDIRECT_URI=\"https://example.com/example/oauth/callback\""
  echo "export EXAMPLE_SUBSCRIPTION_KEY=\"your_api_subscription_key\"  # Optional"
  exit 1
fi

if [ -z "$EXAMPLE_CLIENT_SECRET" ]; then
  echo "❌ EXAMPLE_CLIENT_SECRET is not set!"
  exit 1
fi

if [ -z "$EXAMPLE_APP_REDIRECT_URI" ]; then
  echo "❌ EXAMPLE_APP_REDIRECT_URI is not set!"
  exit 1
fi

# Display configuration (masked for security)
echo "✅ OAuth2 credentials configured:"
echo "   EXAMPLE_CLIENT_ID: ${EXAMPLE_CLIENT_ID:0:8}..."
echo "   EXAMPLE_CLIENT_SECRET: ${EXAMPLE_CLIENT_SECRET:0:8}..."
echo "   EXAMPLE_APP_REDIRECT_URI: $EXAMPLE_APP_REDIRECT_URI"

if [ -n "$EXAMPLE_SUBSCRIPTION_KEY" ]; then
  echo "   EXAMPLE_SUBSCRIPTION_KEY: ${EXAMPLE_SUBSCRIPTION_KEY:0:8}..."
else
  echo "   EXAMPLE_SUBSCRIPTION_KEY: (not set - optional)"
fi

echo ""
echo "🚀 Starting proxy server with OAuth2 configuration..."
echo ""

# Start the proxy server
bun --watch src/index.ts 