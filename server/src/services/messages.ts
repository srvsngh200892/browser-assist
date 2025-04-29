import OpenAI from "openai";
import {
    initialMessageSystemPrompt,
    performNextStepSystemPrompt,
} from "../utils/prompts";
import { DEBUG } from "./env";
import {
    storeMessage,
    storeMessages,
    getSessionMessages,
    getLastAssistantMessage
} from "./firebase-messages";
import { updateSessionActivity } from "./firebase-sessions";

// Define our message type to include all necessary properties
export type MessageType = (OpenAI.Chat.Completions.ChatCompletionMessageParam | OpenAI.Chat.Completions.ChatCompletionMessage | {
    role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
    content: string | null;
    id?: string;
    tool_calls?: Array<any>;
    finish_reason?: string;
}) & {
    tool_calls?: Array<any>;  // Ensure tool_calls is available on all types
};

class MessageHandler {
    private sessionId: string;
    private messages: MessageType[] = [initialMessageSystemPrompt];
    private debug: boolean;
    private lastRetrievalTime: number = 0;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
        this.debug = DEBUG;
        // Initialize with system prompt
        this.storeMessages().catch(err => console.error("Failed to store initial messages:", err));
    }

    public async loadMessages(
        addPerformNextStep: boolean = true
    ): Promise<MessageType[]> {
        try {
            // Load messages from Firebase
            const messages = await getSessionMessages(this.sessionId);

            // If no messages found, return the default initial state
            if (!messages || messages.length === 0) {
                return [initialMessageSystemPrompt];
            }

            if (addPerformNextStep) {
                // Add the next step prompt if requested
                const messagesWithNextStep = [...messages, performNextStepSystemPrompt];
                this.messages = messagesWithNextStep;
                return messagesWithNextStep;
            }

            this.messages = messages;
            return messages;
        } catch (e) {
            console.log("Error loading messages", e);
            return [initialMessageSystemPrompt];
        }
    }

    public async addMessage(message: MessageType) {
        this.messages.push(message);
        if (this.debug) {
            console.log(`Added message with role: ${message.role}`);
        }

        // Store the new message in Firebase
        await storeMessage(this.sessionId, message).catch(err =>
            console.warn(`Failed to Store the new message in Firebase: ${err}`)
        );

        // Update session activity
        await updateSessionActivity(this.sessionId).catch(err =>
            console.warn(`Failed to update session activity: ${err}`)
        );
    }

    public async addMessages(messages: MessageType[]) {
        for (const message of messages) {
            await this.addMessage(message);
        }
    }

    public async storeMessages() {
        try {
            await storeMessages(this.sessionId, this.messages);

            // Update session activity
            await updateSessionActivity(this.sessionId).catch(err =>
                console.warn(`Failed to update session activity: ${err}`)
            );
        } catch (error) {
            console.error("Error storing messages:", error);
        }
    }

    public async getMessages(forceReload: boolean = false) {
        if (forceReload) {
            // Load fresh messages from Firebase
            this.messages = await getSessionMessages(this.sessionId);
        }
        return this.messages;
    }

    public async removeMessageAtIndex(index: number) {
        if (index >= 0 && index < this.messages.length) {
            // Remove message at specified index
            this.messages.splice(index, 1);
        }
        return false;
    }

    public setMessages(messages: MessageType[], stopStore: boolean = true) {
        this.messages = messages;
        if (this.debug) {
            console.log(`Set messages array with ${messages.length} messages`);
        }
        // Store the updated messages in Firebase
        if (stopStore) {
            this.storeMessages().catch(err => console.error("Failed to store updated messages:", err));
        }
    }

    public updateLastRetrievalTime() {
        this.lastRetrievalTime = Date.now();

        // Update session activity when messages are retrieved
        updateSessionActivity(this.sessionId).catch(err =>
            console.warn(`Failed to update session activity: ${err}`)
        );

        return this.lastRetrievalTime;
    }

    public getLastRetrievalTime() {
        return this.lastRetrievalTime;
    }

    public getSessionId() {
        return this.sessionId;
    }

    public async resetToInitialWithLastAssistantMessage(): Promise<void> {
        try {

            // Instead of loading all messages, we'll directly query for the last assistant message
            const lastAssistantMessage = await getLastAssistantMessage(this.sessionId);

            // Set messages to initial prompt and last assistant message (if found)
            if (lastAssistantMessage) {
                this.messages = [initialMessageSystemPrompt, lastAssistantMessage];
            } else {
                this.messages = [initialMessageSystemPrompt];
            }

            // Store the changes to Firebase too
            await this.storeMessages();
        } catch (error) {
            console.error(`[${this.sessionId}] Error resetting messages:`, error);
            // Fallback to just the initial prompt
            this.messages = [initialMessageSystemPrompt];
        }

        // Try to store the fallback messages
        try {
            await this.storeMessages();
        } catch (storeError) {
            console.error(`[${this.sessionId}] Error storing fallback messages:`, storeError);
        }
    }
}


export { MessageHandler };

