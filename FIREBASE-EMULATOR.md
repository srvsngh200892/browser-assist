# Using Firebase Emulators for Development

This guide explains how to use Firebase emulators for local development instead of connecting to the Firebase cloud services.

## Why Use Emulators?

- Develop without an internet connection
- Test without affecting production data
- No costs or quota limits
- Faster development iterations
- Data persistence options for development

## Setup

1. **Install Firebase CLI** (if not already installed):
   ```
   npm install -g firebase-tools
   ```

2. **Configure Environment Variables**:
   Update your `.env` file with these settings:
   ```
   # Firebase Emulator Configuration
   USE_FIREBASE_EMULATOR=true
   FIREBASE_EMULATOR_HOST=localhost
   FIREBASE_EMULATOR_PORT=4000
   FIREBASE_FIRESTORE_EMULATOR_PORT=8080
   ```

## Running the Application with Emulators

### Option 1: Use the integrated script

The simplest way is to use the `--emulators` flag with the start script:

```
./start-all.sh --emulators
```

This will:
1. Start the Firebase emulators
2. Start the server with emulator configuration
3. Start the UI application

### Option 2: Start each component separately

If you need more control, you can start each component separately:

1. **Start Firebase Emulators**:
   ```
   ./start-emulators.sh
   ```
   
   With data persistence (imports/exports data between sessions):
   ```
   ./start-emulators.sh --with-data
   ```

2. **Set environment variables and start the server**:
   ```
   export USE_FIREBASE_EMULATOR=true
   deno task server
   ```

3. **Start the UI application**:
   ```
   cd ui
   npm start
   ```

## Accessing Emulator UI

The Firebase Emulator UI is available at:
```
http://localhost:4000
```

This provides a dashboard where you can:
- View Firestore data in real-time
- Manually edit documents
- Export data snapshots
- Debug authentication
- Monitor emulator logs

## Switching Between Emulators and Cloud

To switch back to the cloud Firebase services:

1. Set `USE_FIREBASE_EMULATOR=false` in your `.env` file
2. Or simply omit the `--emulators` flag when running the start script:
   ```
   ./start-all.sh
   ```

## Development Workflow

A typical development workflow:

1. Start the application with emulators: `./start-all.sh --emulators`
2. Develop and test your changes with the local data
3. When ready to test with cloud data, restart without emulators: `./start-all.sh`

## Troubleshooting

- **Port conflicts**: Ensure ports 8080 (Firestore), 9099 (Auth), and 4000 (UI) are available
- **Data not persisting**: Use the `--with-data` flag with start-emulators.sh
- **Connection errors**: Check that environment variables are correctly set
- **UI not showing data**: Clear browser localStorage to reset timestamp tracking 