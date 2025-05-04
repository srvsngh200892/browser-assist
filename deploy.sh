#!/bin/bash

# Browser Assist deployment script
set -e

# Parse arguments
ENVIRONMENT="dev"
COMMAND="help"

print_usage() {
  echo "Usage: ./deploy.sh [COMMAND]"
  echo ""
  echo "Commands:"
  echo "  build        Build Docker images"
  echo "  dev          Run locally with Docker Compose in development mode (Firebase emulator)"
  echo "  prod         Run locally with Docker Compose in production mode (Firebase cloud)"
  echo "  stop         Stop running Docker Compose containers"
  echo "  help         Show this help message"
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh build      # Build all Docker images"
  echo "  ./deploy.sh dev        # Run in development mode with Firebase emulator"
  echo "  ./deploy.sh prod       # Run in production mode with Firebase cloud"
  echo "  ./deploy.sh stop       # Stop running containers"
}

# Parse command
if [ $# -ge 1 ]; then
  COMMAND=$1
  shift
fi

# Build Docker images
build_images() {
  echo "Building Docker images"

  # Build server image
  echo "Building server image..."
  docker build -t mcp-playwright-sse-server:latest -f Dockerfile.sse .
  
  # Build server image
  echo "Building server image..."
  docker build -t browser-assist-server:latest -f Dockerfile.server .
  
  # Build UI image
  echo "Building UI image..."
  docker build -t browser-assist-ui:latest -f Dockerfile.ui .
  
  # Build Firebase emulator image
  echo "Building Firebase emulator image..."
  docker build -t browser-assist-firebase:latest -f Dockerfile.firebase .
  
  echo "Build completed successfully!"
}

# Ensure environment file exists and has API key
check_env_file() {
  ENV_FILE=$1
  ENV_EXAMPLE=${2:-".env.example"}
  
  if [ ! -f "$ENV_FILE" ]; then
    echo "Warning: $ENV_FILE file not found. Creating from $ENV_EXAMPLE..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "Please edit $ENV_FILE with your API keys and credentials"
    echo "At minimum, you must set your OPENAI_API_KEY"
    exit 1
  fi
  
  # Check if OPENAI_API_KEY is properly configured
  if grep -q "OPENAI_API_KEY=\"YOUR_OPENAI_API_KEY\"" "$ENV_FILE"; then
    echo "Error: OPENAI_API_KEY is not configured in $ENV_FILE"
    echo "Please edit $ENV_FILE and set your OpenAI API key"
    exit 1
  fi
}

# Run in development mode
run_dev() {
  echo "Running application locally with Docker Compose"
  echo "Environment: Development with Firebase emulator"
  
  # Check if environment file exists and is configured
  check_env_file "server/.env"
  
  # Start with Docker Compose
  docker compose up
}

# Run in production mode
run_prod() {
  echo "Running application locally with Production Docker Compose"
  echo "Environment: Production with Firebase cloud"
  
  # Check if environment file exists and is configured
  check_env_file ".env.production"
  
  # Check for Firebase cloud credentials
  if grep -q "FIREBASE_API_KEY=\"YOUR_FIREBASE_API_KEY\"" ".env.production"; then
    echo "Error: Firebase cloud credentials are not configured in .env.production"
    echo "Please edit .env.production with your Firebase cloud credentials"
    exit 1
  fi
  
  # Start with Docker Compose
  docker compose -f docker-compose.prod.yml up
}

# Stop running containers
stop_containers() {
  echo "Stopping running containers..."
  
  if [ -f docker-compose.yml ]; then
    docker compose down
  fi
  
  if [ -f docker-compose.prod.yml ]; then
    docker compose -f docker-compose.prod.yml down
  fi
  
  echo "Containers stopped successfully!"
}

# Execute command
case "$COMMAND" in
  build)
    build_images
    ;;
  dev)
    run_dev
    ;;
  prod)
    run_prod
    ;;
  stop)
    stop_containers
    ;;
  help|*)
    print_usage
    ;;
esac 