#!/bin/bash

# Blackbaud OAuth2 Environment Variables
# IMPORTANT: Replace these with your actual Blackbaud OAuth2 credentials

# Check if environment variables are already set
if [ -z "$BLACKBAUD_CLIENT_ID" ]; then
  echo "❌ BLACKBAUD_CLIENT_ID is not set!"
  echo "Please export your Blackbaud OAuth2 credentials:"
  echo ""
  echo "export BLACKBAUD_CLIENT_ID=\"your_actual_client_id\""
  echo "export BLACKBAUD_CLIENT_SECRET=\"your_actual_client_secret\""  
  echo "export BLACKBAUD_APP_REDIRECT_URI=\"https://home.turpault.me/blackbaud/oauth/callback\""
  echo "export BLACKBAUD_SUBSCRIPTION_KEY=\"your_bb_api_subscription_key\"  # Optional"
  echo ""
  echo "Then run this script again or run: npm start"
  exit 1
fi

if [ -z "$BLACKBAUD_CLIENT_SECRET" ]; then
  echo "❌ BLACKBAUD_CLIENT_SECRET is not set!"
  exit 1
fi

if [ -z "$BLACKBAUD_APP_REDIRECT_URI" ]; then
  echo "❌ BLACKBAUD_APP_REDIRECT_URI is not set!"
  exit 1
fi

echo "✅ Environment variables are set:"
echo "   BLACKBAUD_CLIENT_ID: ${BLACKBAUD_CLIENT_ID:0:8}..."
echo "   BLACKBAUD_CLIENT_SECRET: ${BLACKBAUD_CLIENT_SECRET:0:8}..."
echo "   BLACKBAUD_APP_REDIRECT_URI: $BLACKBAUD_APP_REDIRECT_URI"

# Check for optional subscription key
if [ -n "$BLACKBAUD_SUBSCRIPTION_KEY" ]; then
  echo "   BLACKBAUD_SUBSCRIPTION_KEY: ${BLACKBAUD_SUBSCRIPTION_KEY:0:8}..."
else
  echo "   BLACKBAUD_SUBSCRIPTION_KEY: (not set - optional)"
fi
echo ""

# Enable debug logging to see environment variable substitution
export LOG_LEVEL=debug

echo "🚀 Starting proxy server with OAuth2 configuration..."
npm start 