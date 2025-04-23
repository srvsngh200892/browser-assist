import { MessageType } from '../services/messages';
import { estimateTokenCount } from './token-utils';

export interface MessageInteraction {
    messages: MessageType[];
    hasToolCalls: boolean;
}

export function groupMessagesIntoInteractions(workingMessages: MessageType[]): MessageInteraction[] {
    const interactions: MessageInteraction[] = [];
    let currentInteraction: MessageType[] = [];
    let hasToolCalls = false;

    for (const message of workingMessages) {
        if (message.role === 'assistant') {
            if (currentInteraction.length > 0) {
                interactions.push({ messages: currentInteraction, hasToolCalls });
            }
            // Start a new interaction
            hasToolCalls = Boolean(message.tool_calls?.length);
            currentInteraction = [message];

            // If no tool calls, immediately complete this interaction
            if (!hasToolCalls) {
                interactions.push({ messages: currentInteraction, hasToolCalls });
                currentInteraction = [];
            }
        } else if (message.role === 'tool') {
            currentInteraction.push(message);

            // Check if we have all tool responses for this interaction
            const assistantMessage = currentInteraction[0];
            const expectedToolCalls = assistantMessage.tool_calls?.length || 0;
            const toolResponses = currentInteraction.filter(m => m.role === 'tool').length;

            if (toolResponses === expectedToolCalls) {
                interactions.push({ messages: currentInteraction, hasToolCalls });
                currentInteraction = [];
            }
        }
    }

    // Add any remaining interaction
    if (currentInteraction.length > 0) {
        interactions.push({ messages: currentInteraction, hasToolCalls });
    }

    return interactions;
}

export function reconstructMessages(
    interactions: MessageInteraction[],
    keepLastNToolInteractions: number
): MessageType[] {
    // Separate tool and non-tool interactions
    const toolInteractions = interactions.filter(interaction => interaction.hasToolCalls);
    const nonToolInteractions = interactions.filter(interaction => !interaction.hasToolCalls);

    // Keep only the most recent N tool interactions
    const recentToolInteractions = toolInteractions.slice(-keepLastNToolInteractions);

    // Reconstruct messages in original order
    const reconstructedMessages: MessageType[] = [];
    let toolInteractionIndex = 0;

    for (const interaction of interactions) {
        if (interaction.hasToolCalls) {
            // For tool interactions, use from the recent ones if available
            if (toolInteractionIndex < recentToolInteractions.length) {
                reconstructedMessages.push(...recentToolInteractions[toolInteractionIndex].messages);
                toolInteractionIndex++;
            }
        } else {
            // Keep non-tool interactions as is
            reconstructedMessages.push(...interaction.messages);
        }
    }

    return reconstructedMessages;
}

export async function trimAndAddSystemPrompt(
    messages: any[],
    messageHandler: any,
    systemPrompt: any
) {
    // Check if we need to trim messages
    if (messages.length < await messageHandler.getMessages().then((m: MessageType[]) => m.length)) {
        console.log(`Trimming tool messages while preserving order`);
        await messageHandler.setMessages(messages, false);
        const estimatedTokens = estimateTokenCount(messages);
        console.log(`Estimated tokens After trimming: ${estimatedTokens}`);
        console.log(`After trimming Messages: ${JSON.stringify(messages, null, 2)}`);
    }

    // Add system prompt at the end only if last message is not from user
    let addedSystemPrompt = false;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role !== 'user') {
        messages = [...messages, systemPrompt];
        addedSystemPrompt = true;
    }

    return { messages, addedSystemPrompt };
} 