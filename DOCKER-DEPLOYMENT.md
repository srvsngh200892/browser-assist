# Docker Deployment Guide

This guide explains how to deploy the OpenAI MCP Client application using Docker.

## Architecture Overview

The application consists of three main components:
1. **Server**: Deno backend that handles API requests and communicates with OpenAI
2. **UI**: React frontend that provides the user interface
3. **Firebase**: Used for data storage (emulator for local development, cloud for production)

## Quick Start

The easiest way to start the application is to use the provided deploy script:

```bash
# Build the Docker images
./deploy.sh build

# Start the application in development mode (with Firebase emulator)
./deploy.sh dev

# OR start the application in production mode (with Firebase cloud)
./deploy.sh prod

# Stop the application when done
./deploy.sh stop
```

## Environment Configuration

The application uses separate environment files for different environments:

### Development Environment (.env.development)

This file contains configuration for the development environment, using Firebase emulator:

1. If the file doesn't exist, it will be created from a template when you run `./deploy.sh dev`
2. You need to edit this file and set your OpenAI API key:
   ```
   OPENAI_API_KEY="your-openai-api-key"
   ```
3. The default Firebase configuration for the emulator is already set

### Production Environment (.env.production)

This file contains configuration for the production environment, using Firebase cloud:

1. If the file doesn't exist, it will be created from a template when you run `./deploy.sh prod`
2. You need to edit this file and set:
   - Your OpenAI API key
   - A strong JWT secret
   - Your Firebase cloud credentials
   ```
   OPENAI_API_KEY="your-openai-api-key"
   JWT_SECRET="your-strong-secret-key"
   FIREBASE_API_KEY="your-firebase-api-key"
   FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
   FIREBASE_PROJECT_ID="your-project-id"
   # ...and other Firebase settings
   ```

## Docker Configuration

### Development Environment

For development, we use Docker Compose with the Firebase emulator:

1. Make sure you've set up your `.env.development` file with your OpenAI API key
2. Start the application with:
   ```bash
   ./deploy.sh dev
   ```
   or directly with Docker Compose:
   ```bash
   docker compose up
   ```

3. Access the applications:
   - UI: http://localhost:3002
   - Server API: http://localhost:3001
   - Firebase Emulator UI: http://localhost:4000

### Production Environment

For production, we use a different Docker Compose file that connects to Firebase cloud:

1. Make sure you've set up your `.env.production` file with all required credentials
2. Start the application with:
   ```bash
   ./deploy.sh prod
   ```
   or directly with Docker Compose:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

3. Access the applications:
   - UI: http://localhost (port 80)
   - Server API: http://localhost:3001

## Container Details

### Server Container (Deno Backend)

- Built from `Dockerfile.server`
- Runs on port 3001
- Handles API requests and connects to OpenAI
- Stores data in Firebase (emulator or cloud)
- Environment variables are provided via env_file in docker-compose

### UI Container (React Frontend)

- Built from `Dockerfile.ui`
- Serves the React UI through NGINX on port 80
- Provides the user interface
- Communicates with the server API

### Firebase Emulator Container

- Built from `Dockerfile.firebase`
- Provides local Firebase services for development
- Exposes ports:
  - 4000: Emulator UI
  - 8080: Firestore
  - 9099: Authentication

## Environment Variables

The application uses several environment variables. The main ones you need to configure are:

### Required Variables
- `OPENAI_API_KEY`: Your OpenAI API key (required for both environments)
- For production, you also need all Firebase cloud credentials

### Optional Variables (with sensible defaults)
- `JWT_SECRET`: Secret for JWT token generation (has default in development)
- `OPENAI_MODEL`: The OpenAI model to use (default: gpt-4o)
- `MCP_SERVER_COMMAND`: Command to start the Playwright MCP server
- `MCP_SERVER_ARGS`: Arguments for the MCP server

## Troubleshooting

### Container Issues

Check container logs:
```bash
docker compose logs server
docker compose logs ui
docker compose logs firebase
```

### Firebase Emulator Issues

- Check container is running: `docker ps | grep firebase`
- Verify connectivity from server: `docker exec browser-assist-client-server curl firebase:4000`

### Server Issues

- Check server logs: `docker compose logs server`
- Verify server is running: `curl http://localhost:3001/health`

### UI Issues

- Check UI logs: `docker compose logs ui`
- Verify NGINX configuration: `docker exec browser-assist-client-ui cat /etc/nginx/conf.d/default.conf` 