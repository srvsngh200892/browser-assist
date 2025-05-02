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
    getLastAssistantMessage,
    sessionHasMessages,
} from "./firebase-messages";
import { updateSessionActivity } from "./firebase-sessions";

export type MessageType = (
    | OpenAI.Chat.Completions.ChatCompletionMessageParam
    | OpenAI.Chat.Completions.ChatCompletionMessage
    | {
        role: "system" | "user" | "assistant" | "tool" | "function";
        content: string | null;
        id?: string;
        tool_calls?: Array<any>;
        finish_reason?: string;
    }
) & {
    tool_calls?: Array<any>;
};

class MessageHandler {
    private sessionId: string;
    private messages: MessageType[] = [initialMessageSystemPrompt];
    private debug: boolean;
    private lastRetrievalTime = 0;
    private hasLoaded = false;

    private constructor(sessionId: string) {
        this.sessionId = sessionId;
        this.debug = DEBUG;
    }

    /** Factory method that ensures full initialization */
    public static async create(sessionId: string): Promise<MessageHandler> {
        console.log(`Creating MessageHandler for session ${sessionId}`);
        const handler = new MessageHandler(sessionId);
        await handler.storeMessages(); // This will throw if it fails
        const hasMessages = await sessionHasMessages(sessionId);
        if (hasMessages) {
            console.log(`Session ${sessionId} has messages, loading them`);
            await handler.loadMessages(false);
        }
        return handler;
    }

    public async loadMessages(addPerformNextStep: boolean = true): Promise<MessageType[]> {
        if (this.hasLoaded) return this.messages;

        const messages = await getSessionMessages(this.sessionId);

        if (!messages || messages.length === 0) {
            this.messages = [initialMessageSystemPrompt];
        } else {
            this.messages = addPerformNextStep
                ? [...messages, performNextStepSystemPrompt]
                : messages;
        }

        this.hasLoaded = true;
        return this.messages;
    }

    public async addMessage(message: MessageType): Promise<void> {
        this.messages.push(message);

        if (this.debug) {
            console.log(`Added message with role: ${message.role}`);
        }

        await storeMessage(this.sessionId, message);
        await updateSessionActivity(this.sessionId);
    }

    public async addMessages(messages: MessageType[]): Promise<void> {
        for (const message of messages) {
            await this.addMessage(message);
        }
    }

    public async storeMessages(): Promise<void> {
        await storeMessages(this.sessionId, this.messages);
        await updateSessionActivity(this.sessionId);
    }

    public async getMessages(forceReload: boolean = false): Promise<MessageType[]> {
        if (forceReload) {
            this.messages = await getSessionMessages(this.sessionId);
            this.hasLoaded = true;
        }
        return this.messages;
    }

    public async removeMessageAtIndex(index: number): Promise<boolean> {
        if (index >= 0 && index < this.messages.length) {
            this.messages.splice(index, 1);
            return true;
        }
        return false;
    }

    public async setMessages(messages: MessageType[], stopStore: boolean = true): Promise<void> {
        this.messages = messages;

        if (this.debug) {
            console.log(`Set messages array with ${messages.length} messages`);
        }

        if (stopStore) {
            await this.storeMessages(); // Will throw if it fails
        }
    }

    public async updateLastRetrievalTime(): Promise<number> {
        this.lastRetrievalTime = Date.now();

        // Passive error swallowing here; adjust if critical
        await updateSessionActivity(this.sessionId);

        return this.lastRetrievalTime;
    }

    public getLastRetrievalTime(): number {
        return this.lastRetrievalTime;
    }

    public getSessionId(): string {
        return this.sessionId;
    }
}

export { MessageHandler };