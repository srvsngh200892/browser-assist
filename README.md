# Browser Assist

This AI-powered automation platform allows users to control and observe browser interactions in real-time using natural language prompts. By combining OpenAI's language capabilities with mcp-playwright, the system interprets user instructions and performs corresponding actions in the browser, with live visual feedback.

Designed to eliminate the need for manual scripting, the application streamlines a variety of tasks, including:

Automated Manual Testing: QA engineers can describe test cases in plain English (e.g., “Log into the app and verify the dashboard loads”), and the system runs the test in real-time, reducing time spent on repetitive test setups.

UI Walkthroughs and Demos: Product teams can generate guided product tours or feature walkthroughs by simply describing the steps, making it easy to showcase workflows.

Web Data Exploration: Users can instruct the agent to navigate websites, extract specific data, or simulate user flows for research or scraping purposes.

Regression Checks: Developers can validate UI behavior across multiple changes by describing previously known flows and having the AI replay them on-demand.

Many more ...

With natural language as the interface, this tool makes browser automation accessible to both technical and non-technical users.

## Features

- Real-time browser streaming with screenshots
- AI-powered assistance using OpenAI models
- Generates PDF reports of the test results with conversation history
- MCP (Model Context Protocol) Playwright by Microsoft for browser automation
- Firebase integration for data persistence
- User authentication and session management using JWT token and refresh token
- On logout your chat and session information will be deleted (You can customize based on your need).
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
- mkcert & generate TLS certs

## Getting Started

### Environment Development Setup

1. Clone the repository:

```bash
git clone https://github.com/srvsngh200892/browser-assist.git
cd browser-assist
```

2. For Sever Create a `.env` file in the ui and sever directory:

```bash
Copy the server/.env.example file to server/.env and update the variables that has "CHANGE_ME" unless you want to have different config
```

2. For UI Create a `.env` file in the UI directory with the following variables:

```bash
Copy the ui/.env.example file to ui/.env and update the variables that has "CHANGE_ME" unless you want to have different config
```

3. Setup https

```bash
brew install mkcert
mkcert -install
mkcert localhost
mv localhost.pem nginx/localhost.pem
mv localhost-key.pem nginx/localhost-key.pem
```

### Running with Docker

```bash
./deploy.sh build
./deploy.sh dev
```

3. Access the application:
   - https://localhost
   - Firebase Emulator: http://localhost:4000

### Firebase

```
Only use firebase emulator for local development
To deploy to the server, set USE_FIREBASE_EMULATOR=false in server/.env and provide your GCP Firebase credentials.
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
- `POST /api/refresh`: Refresh token
- `GET /api/auth-check`: Refresh token

### Message Creation and Fetch

- `POST /api/chat/:sessionId`: Sending a new user message
- `GET /api/message/:sessionId`: Getting all message or message since

### Browser Streaming

- `GET /api/browser-stream/:sessionId`: Get real-time browser screenshots
- `POST /api/stream-control`: Control streaming (pause/resume)
- `POST /api/stream-disconnect`: Disconnect from a stream

## License
