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
        if (message.role === 'user') {
            // Start a new interaction with the user message
            if (currentInteraction.length > 0) {
                interactions.push({ messages: currentInteraction, hasToolCalls });
            }
            currentInteraction = [message];
            hasToolCalls = false;
        } else if (message.role === 'assistant') {
            // Add assistant message to current interaction
            currentInteraction.push(message);
            hasToolCalls = Boolean(message.tool_calls?.length);

            // If no tool calls, complete this interaction
            if (!hasToolCalls) {
                interactions.push({ messages: currentInteraction, hasToolCalls });
                currentInteraction = [];
            }
        } else if (message.role === 'tool') {
            currentInteraction.push(message);

            // Check if we have all tool responses for this interaction
            const assistantMessage = currentInteraction.find(m => m.role === 'assistant');
            const expectedToolCalls = assistantMessage?.tool_calls?.length || 0;
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

export function reconstructMessages(interactions: MessageInteraction[], keepLastNToolInteractions: number): MessageType[] {
    // Find interactions with tool calls
    const toolInteractions = interactions.filter(i => i.hasToolCalls);
    const lastNToolInteractions = toolInteractions.slice(-keepLastNToolInteractions);

    return interactions.flatMap(interaction => {
        // If this interaction has tool calls
        if (interaction.hasToolCalls) {
            // Only keep the tool-related messages if it's in the last 3 tool interactions
            if (lastNToolInteractions.includes(interaction)) {
                return interaction.messages;
            } else {
                // For older tool interactions, only keep user and final assistant message
                return interaction.messages.filter(msg =>
                    msg.role === 'user' ||
                    (msg.role === 'assistant' && !msg.tool_calls)
                );
            }
        }
        // Keep all messages from non-tool interactions
        return interaction.messages;
    });
}

export async function trimAndAddSystemPrompt(
    messages: any[],
    messageHandler: any,
    systemPrompt: any,
    model: string,
    openaiClient: any,
    interactions: MessageInteraction[]
) {
    console.log(`after Messages: ${messages.length}`);
    // const completedPairs = getDirectConversationPairs(messages);
    // if (completedPairs.length > 0) {
    //     const summary = await getAISummaryOfConversation(completedPairs, openaiClient, model);
    //     console.log(`Summary: ${summary}`);
    //     messages = removeDirectConversations(messages);
    //     messages.splice(1, 0, ...[
    //         { role: 'user', content: 'Summary of our previous conversation:' },
    //         { role: 'assistant', content: summary }
    //     ]);
    // }

    await messageHandler.setMessages(messages, false);
    // Add system prompt at the end only if last message is not from user
    let addedSystemPrompt = false;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role !== 'user') {
        messages = [...messages, systemPrompt];
        addedSystemPrompt = true;
    }

    return { trimmedMessage: messages, addedSystemPrompt };
}

export function getDirectConversationPairs(messages: MessageType[]): MessageType[] {
    const pairs: MessageType[] = [];

    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];

        // Find user messages
        if (message.role === 'user') {
            // Look for the next assistant message without tool_calls
            for (let j = i + 1; j < messages.length; j++) {
                const assistantMessage = messages[j];
                if (assistantMessage.role === 'assistant' &&
                    !assistantMessage.tool_calls) {
                    // Add the pair and break inner loop
                    pairs.push(message);
                    pairs.push(assistantMessage);
                    break;
                }
            }
        }
    }

    return pairs;
}

export function removeDirectConversations(messages: MessageType[]): MessageType[] {
    const directPairs = getDirectConversationPairs(messages);
    if (!directPairs.length) {
        return messages;
    }
    const pairSignatures = directPairs.map(msg => `${msg.role}:${msg.content}`);

    return messages.filter(message => {
        if (message.content === null || message.role === 'system') {
            return true;
        }

        const signature = `${message.role}:${message.content}`;
        return !pairSignatures.includes(signature);
    });
}

export async function getAISummaryOfConversation(
    messages: MessageType[],
    openaiClient: any,
    model: string
): Promise<string> {
    // Use getDirectConversationPairs instead of missing function
    console.log(`Getting AI summary of conversation of pairs: ${JSON.stringify(messages, null, 2)}`);
    if (messages.length === 2 && messages[0].role === 'user' && messages[0].content === 'Summary of our previous conversation:') {
        console.log(`now new event Returning summary old summary`);
        return messages[1].content as string;
    }
    const WORKFLOW_SUMMARY_PROMPT = `You are managing an operational workflow summary.

        You will be given:
        - A new workflow event (a description of an action that was attempted or completed).
        - (Optionally) a previous summary.

        Rules:
        1. If a step is only attempted but not confirmed successful (due to error, missing fields, etc.), it must stay in "Pending" or "Blocked".
        2. Only move a step to "Completed" if it is explicitly confirmed saved/successful.
        3. Always keep all important operational details (URLs, credentials, field values, options selected, templates used).
        4. Never assume completion. If success is not mentioned clearly, assume the step is still pending.
        5. If previous steps were blocked, recheck them. If not unblocked, keep them in "Blocked".

        Output format:
        ✅ Completed Steps
        ⏳ Pending Steps
        🔥 Blocked Steps
        🔜 Next Steps

        Be conservative: Prefer keeping a step Pending/Blocked unless fully sure of completion.`;



    // Create a prompt for the AI
    const summaryPrompt = {
        role: "system",
        content: WORKFLOW_SUMMARY_PROMPT
    };

    // Add the conversation history
    const conversationContext = messages.map((msg: MessageType) => ({
        role: msg.role,
        content: msg.content
    }));

    try {
        const response = await openaiClient.chat.completions.create({
            model: model,
            messages: [summaryPrompt, ...conversationContext],
            temperature: 0.2,
            max_tokens: 1000
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error getting AI summary:', error);
        return "Failed to generate conversation summary.";
    }
} 