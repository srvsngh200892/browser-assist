/**
 * Standard messages for ARM64 browser limitations
 * 
 * This file provides consistent messages to inform users about 
 * browser automation limitations when running on ARM64 architecture.
 */

// Main explanation message for browser limitations
export const ARM64_BROWSER_LIMITATION_MESSAGE = `
It seems that the current environment does not support the installation of the required browser for automation due to compatibility issues with Linux Arm64 architecture.

To resolve this issue, you have several options:

1. Run the application on an x86_64 architecture that supports browser installation
2. Use a Docker image with x86_64 emulation enabled
3. Configure a remote browser automation service
4. Use the API directly without browser automation features

The application will continue running with limited functionality.
`;

// Short message for tool calls
export const ARM64_TOOL_ERROR_MESSAGE =
    "Browser automation is not available on Linux ARM64 architecture in Docker containers";

// Navigation replacement message
export const getNavigationFallbackMessage = (url: string) => `
Unable to navigate to ${url} due to browser compatibility issues on ARM64 architecture.

The application will continue running, but browser navigation features are limited.
`;

// Function to simulate a delay (for more realistic behavior)
export async function simulateDelay(ms = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to get a complete response with appropriate messaging
export function getBrowserLimitationResponse(toolName: string, args: Record<string, any> = {}) {
    return {
        success: false,
        error: ARM64_TOOL_ERROR_MESSAGE,
        fallback: true,
        toolName,
        args,
        message: ARM64_BROWSER_LIMITATION_MESSAGE,
        timestamp: new Date().toISOString()
    };
} 