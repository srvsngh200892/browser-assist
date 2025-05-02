# Browser Assist
This AI-powered automation platform allows users to control and observe browser interactions in real-time using natural language prompts. By combining OpenAI's language capabilities with mcp-playwright, the system interprets user instructions and performs corresponding actions in the browser, with live visual feedback.

Designed to eliminate the need for manual scripting, the application streamlines a variety of tasks, including:

Automated Manual Testing: QA engineers can describe test cases in plain English (e.g., “Log into the app and verify the dashboard loads”), and the system runs the test in real-time, reducing time spent on repetitive test setups.

UI Walkthroughs and Demos: Product teams can generate guided product tours or feature walkthroughs by simply describing the steps, making it easy to showcase workflows.

Web Data Exploration: Users can instruct the agent to navigate websites, extract specific data, or simulate user flows for research or scraping purposes.

Regression Checks: Developers can validate UI behavior across multiple changes by describing previously known flows and having the AI replay them on-demand.

Training and Onboarding: New team members can learn product functionality by watching live, prompt-driven interactions rather than reading documentation or watching static videos.

With natural language as the interface, this tool makes browser automation accessible to both technical and non-technical users.

## Features

- Real-time browser streaming with screenshots
- AI-powered assistance using OpenAI models
- Generates PDF reports of the test results with conversation histoy
- MCP (Model Context Protocol) Playwright by Microsoft for browser automation
- Firebase integration for data persistence
- User authentication and session management using JWT
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
```bash
Copy the .env.example file to .env and update the variables
```

### Running with Docker

```bash
./deploy.sh build
./deploy.sh dev
```

3. Access the application:
   - UI: http://localhost:3002
   - Server API: http://localhost:3001
   - Firebase Emulator: http://localhost:8080
   - MCP Server: http://localhost:3003


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

## License

