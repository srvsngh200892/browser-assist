# Browser Assist

A real-time streaming client for browser automation that provides screenshot streaming capabilities with Firebase-backed session and message management.

## Features

- Real-time browser streaming via Server-Sent Events (SSE)
- Firebase integration for persistent message and session storage
- Real-time message updates with Firebase
- Firebase emulator support for local development
- WebSocket-based notifications using Socket.IO
- Playwright WebKit browser integration
- Interactive UI with real-time status updates
- Screenshot capability

## Prerequisites

- [Deno](https://deno.com/runtime) (for the server)
- [Node.js](https://nodejs.org/) (for the UI)
- WebKit browser (installed via the provided script)
- [Firebase Project](https://console.firebase.google.com/) (for message storage and session management)
- [Firebase CLI](https://firebase.google.com/docs/cli) (optional, for local emulators)

## Firebase Setup

Before running the application, you need to set up Firebase:

1. Create a Firebase project at https://console.firebase.google.com/
2. Set up Firestore Database in test mode
3. Register a web app in your Firebase project
4. Copy your Firebase configuration to the `.env` file
5. See `.env.firebase` for detailed setup instructions

## Quick Start

For the easiest setup, use the start-all script:

```bash
# Make scripts executable
chmod +x *.sh

# Configure your Firebase settings in .env
# See .env.example and .env.firebase for guidance

# Run the start-all script
./deploy.sh build

# Or run with Firebase emulators for local development
./deploy.sh dev
```

This will:
1. Check and install WebKit if needed
2. Start Firebase emulators if the `--emulators` flag is used
3. Start the server on port 3001
4. Start the UI on port 3002

## Firebase Development with Emulators

For local development without requiring a Firebase cloud project, you can use Firebase emulators:

```bash
# Start the application with emulators
 firebase emulators:start --project demo-local
```

This enables offline development with local Firestore emulation. See [FIREBASE-EMULATOR.md](FIREBASE-EMULATOR.md) for detailed instructions on setting up and using emulators.

## Manual Setup

### Server Setup

```bash
# Install server dependencies
deno cache --reload server/server.ts

# Configure your Firebase settings in .env
# See .env.example and .env.firebase for guidance

# Start the server
deno task server
```

The server will run on http://127.0.0.1:3001

### UI Setup

```bash
# Navigate to UI directory
cd ui

# Install dependencies
npm install

# Start development server
npm run dev
```

The UI will run on http://127.0.0.1:3002


## Troubleshooting

If you encounter issues, you can:

1. Run the diagnostic script:
   ```bash
   ./diagnose.sh
   ```

2. Check common issues:
   - Make sure both server and UI are running
   - Ensure WebKit browser is installed
   - Check if the server is accessible at http://127.0.0.1:3001/ping
   - Check if the UI is accessible at http://127.0.0.1:3002
   - Verify Firebase configuration in your `.env` file


## API Endpoints

- `/session` - Create a new session
- `/chat/:sessionId` - Send a message in a session
- `/messages/:sessionId` - Get messages for a session (supports `since` timestamp parameter)
- `/browser-stream/:sessionId` - Stream browser screenshots
- `/screenshot` - Manually request a screenshot
- `/status` - Check server status
- `/ping` - Simple health check

## Architecture

The application consists of:

1. **Backend Server** (Deno/Oak)
   - Handles API requests
   - Manages browser automation
   - Provides real-time streaming
   - Integrates with Firebase for data persistence

2. **Frontend UI** (React)
   - Interactive chat interface
   - Browser stream visualization
   - Status monitoring

3. **Firebase**
   - Stores session data
   - Provides persistent message storage
   - Enables real-time updates

# browser-assist
