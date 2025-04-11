# Browser Assist

Browser Assist is an intelligent browser automation companion that provides AI-powered assistance for web browsing tasks. It uses OpenAI's models and Firebase for data persistence, all running in a containerized environment with Docker.

## Features

- Real-time browser streaming with screenshots
- AI-powered assistance using OpenAI models
- Firebase integration for data persistence
- User authentication and session management
- Docker-based deployment for easy setup

## Architecture

The project consists of several components:

- **UI**: React-based frontend
- **Server**: Express.js backend with TypeScript
- **Firebase**: Used for data persistence and authentication
- **MCP (Model Context Protocol)**: Used for browser automation

## Prerequisites

- Docker and Docker Compose
- Node.js 18+
- OpenAI API key
- Firebase project (or Firebase emulator for development)

## Getting Started

### Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/srvsngh200892/browser-assist.git
cd browser-assist
```

2. Create a `.env` file in the root directory with the following variables:
```
# Server Configuration
PORT=3001
HOST=0.0.0.0
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
DEBUG=true

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
FIREBASE_APP_ID=your_firebase_app_id

# Firebase Emulator (for development)
USE_FIREBASE_EMULATOR=true
FIREBASE_EMULATOR_HOST=firebase
FIREBASE_EMULATOR_PORT=8080

# MCP Configuration
MCP_SERVER_URL=http://localhost:3003/sse
```

### Running with Docker

1. Start all services:
```bash
docker-compose up -d
```

2. View logs:
```bash
docker-compose logs -f
```

3. Access the application:
   - UI: http://localhost:3002
   - Server API: http://localhost:3001
   - Firebase Emulator: http://localhost:8080
   - MCP Server: http://localhost:3003

### Development

#### UI Development

The UI is a React application with proxy configuration for API requests:

```bash
cd ui
npm install
npm start
```

#### Server Development

The server is a TypeScript Express application:

```bash
cd server
npm install
npm run dev
```

## API Endpoints

### Session Management

- `POST /api/session`: Create a new session
- `GET /api/sessions`: Get all session IDs
- `GET /api/session/:sessionId`: Get session details

### Authentication

- `POST /api/auth/login`: User login
- `POST /api/auth/register`: User registration
- `POST /api/logout`: User logout

### Browser Streaming

- `GET /api/browser-stream/:sessionId`: Get real-time browser screenshots
- `POST /api/stream-control`: Control streaming (pause/resume)
- `POST /api/stream-disconnect`: Disconnect from a stream

## Troubleshooting

### CORS Issues

If you encounter CORS issues, check:
1. The server's CORS configuration in `server/src/server.ts`
2. The proxy configuration in `ui/src/setupProxy.js`
3. Ensure proper headers for SSE connections

### Docker Network Issues

If containers can't communicate:
1. Check the Docker network configuration in `docker-compose.yml`
2. Ensure environment variables are properly set for each service
3. Restart the Docker containers with `docker-compose down && docker-compose up -d`

## License

