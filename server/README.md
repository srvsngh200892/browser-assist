# Browse Assist - Express Server

This is the Node.js Express backend for the Browse Assist application. The server handles authentication, session management, messaging, and browser automation functionality.

## Project Migration

This server has been migrated from a Deno-based implementation to Node.js with Express. The migration preserves all the functionality of the original server including:

- Authentication with JWT
- User management
- Session management
- Real-time browser streaming
- OpenAI integration
- Firebase data storage

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Firebase account (if using production Firebase)

## Installation

1. Clone the repository
2. Navigate to the server directory
3. Install dependencies:

```bash
cd server
npm install
```

## Configuration

1. Copy the `.env.example` file from `src/.env.example` to the project root:

```bash
cp src/.env.example /src/.env
```

2. Update the environment variables in the `.env` file with your own values:

```
PORT=3001
HOST=0.0.0.0
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT=20
MCP_SERVER_URL=http://localhost:3003/sse
JWT_SECRET=your_jwt_secret_key

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_firebase_domain
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
FIREBASE_APP_ID=your_firebase_app_id
```

## Development

To start the server in development mode:

```bash
npm run dev
```

This will start the server with hot-reloading enabled.

## Building for Production

Build the TypeScript code:

```bash
npm run build
```

This compiles the TypeScript code to JavaScript in the `dist` directory.

## Running in Production

Start the server in production mode:

```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Log in an existing user
- `POST /api/auth/logout` - Log out a user

### Sessions

- `POST /api/session` - Create a new session
- `GET /api/session/:sessionId` - Get session info
- `GET /api/sessions` - List active sessions

### Messages

- `GET /api/messages/:sessionId` - Get messages for a session
- `POST /api/chat/:sessionId` - Send a message in a session

### Streaming

- `GET /api/browser-stream/:sessionId` - Get a real-time stream of browser screenshots
- `POST /api/stream-control` - Control (pause/resume) a browser stream
- `POST /api/stream-disconnect` - Disconnect a browser stream

### Utility

- `GET /api/health` - Health check endpoint
- `GET /api/ping` - Simple ping endpoint

## Testing

Run tests:

```bash
npm test
```

## License

[MIT](LICENSE) 