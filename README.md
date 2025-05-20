# Browser Assist

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991.svg?style=flat&logo=OpenAI&logoColor=white)](https://openai.com/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33.svg?style=flat&logo=Playwright&logoColor=white)](https://playwright.dev/)

## Table of Contents
- [Overview](#browser-assist)
- [Features](#features)
- [Architecture](#architecture)
- [Models and LLM Integration](#models-and-llm-integration)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Environment Development Setup](#environment-development-setup)
  - [Running with Docker](#running-with-docker)
  - [Firebase Setup](#firebase)
  - [Running UI Tests](#running-ui-tests)
  - [Running Server Tests](#running-server-tests)
- [API Endpoints](#api-endpoints)
- [Performance Considerations](#performance-considerations)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

This AI-powered automation platform allows users to control and observe browser interactions in real-time using natural language prompts. By combining OpenAI's language capabilities with mcp-playwright, the system interprets user instructions and performs corresponding actions in the browser, with live visual feedback.

Designed to eliminate the need for manual scripting, the application streamlines a variety of tasks, including:

Automated Manual Testing: QA engineers can describe test cases in plain English (e.g., "Log into the app and verify the dashboard loads"), and the system runs the test in real-time, reducing time spent on repetitive test setups.

UI Walkthroughs and Demos: Product teams can generate guided product tours or feature walkthroughs by simply describing the steps, making it easy to showcase workflows.

Web Data Exploration: Users can instruct the agent to navigate websites, extract specific data, or simulate user flows for research or scraping purposes.

Regression Checks: Developers can validate UI behavior across multiple changes by describing previously known flows and having the AI replay them on-demand.

Many more ...

With natural language as the interface, this tool makes browser automation accessible to both technical and non-technical users.

## Features

- Real-time browser streaming with screenshots
- AI-powered assistance using OpenAI models
- Generates PDF reports of the test results with conversation history
- Comprehensive validation process with detailed step-by-step results and explanations via AI
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

## Models and LLM Integration

The system is designed with flexibility in mind, allowing you to leverage different Language Models (LLMs) for various tasks:

### Default Configuration
By default, the system is configured to work with OpenAI's models. However, the architecture supports easy integration with other LLMs through LiteLLM, making it highly adaptable to different use cases and requirements.

### Agent-Specific Model Selection
Different agents can utilize different models based on their specific needs:

- **Navigation Agent**: Optimized for quick decision-making and browser interaction
  - Recommended: Gemini-2.5-flash for its fast response time and efficient navigation capabilities
  - Alternative options: GPT-4.1 or GPT-4.0 etc

- **Validation Agent**: Focused on thorough analysis and verification
  - Recommended: GPT-4.1 or GPT-4.0 for high-accuracy validation
  - Alternative options: Gemini-2.5-flash, Claude-3 Opus, Llama-2-70b

### Model Flexibility
Thanks to LiteLLM integration, you can easily switch between various LLM providers:

- OpenAI models (default)
- Google's Gemini models
- Anthropic's Claude models
- Meta's Llama models
- Open-source models (when self-hosted)

[LiteLLM](https://github.com/BerriAI/litellm) (⭐ on GitHub) provides a unified interface to call 100+ LLMs using the same input/output format. This integration enables seamless switching between different AI models without changing your application code.

This flexibility allows you to:
- Optimize costs by choosing more affordable models for simpler tasks
- Ensure compliance with specific regional or organizational requirements
- Take advantage of different models' strengths for specific use cases
- Implement fallback options for high availability

To switch models, simply update the configuration in your environment settings. The system's modular architecture ensures smooth integration with your chosen LLM provider.

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

2. For Server Create a `.env` file in the ui and server directory:

```bash
Copy the server/.env.example file to server/.env and update the variables that has "CHANGE_ME" unless you want to have different config
```

3. For UI Create a `.env` file in the UI directory with the following variables:

```bash
Copy the ui/.env.example file to ui/.env and update the variables that has "CHANGE_ME" unless you want to have different config
```

4. Setup https

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

### Running UI Tests

```bash
cd ui && npm test
```

### Running Server Tests

```bash
Coming soon
```

## API Endpoints

### Session Management

- `POST /api/session`: Create a new session
- `GET /api/sessions`: Get all session IDs
- `GET /api/session/:sessionId`: Get session details

### Authentication

- `POST /api/auth/login`: User login
- `POST /api/auth/register`: User registration
- `POST /api/logout`: User logout (with optional data deletion)
- `POST /api/refresh`: Refresh token
- `GET /api/auth-check`: Check authentication status

### Message Creation and Fetch

- `POST /api/chat/:sessionId`: Send a new user message
- `GET /api/messages/:sessionId`: Get all messages or messages since a timestamp

### Browser Streaming

- `GET /api/browser-stream/:sessionId`: Get real-time browser screenshots
- `POST /api/stream-control`: Control streaming (pause/resume)
- `POST /api/stream-disconnect`: Disconnect from a stream

### Validation and Reports

- `GET /api/validation/report/:sessionId`: Generate and stream validation report PDF
- `POST /api/validation/download-from-storage`: Download a file from storage
- `POST /api/validate-via-ai`: Start AI-powered validation for a session
- `GET /api/validate-via-ai/:sessionId`: Get validation status and results

## Troubleshooting

### Common Issues
1. **Docker Setup Issues**
   - Ensure all required ports are available
   - Check Docker memory allocation
   - Verify network configurations

2. **Browser Automation Problems**
   - Check MCP container is running
   - Verify dependencies
   - Review network connectivity

3. **Model Integration Issues**
   - Validate API keys and permissions
   - Check model availability
   - Review rate limits and quotas

### Debugging Tools
- Built-in logging system
- Performance monitoring
- Error tracking integration
- Debug mode instructions


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Built with ❤️ by the Browser Assist Team