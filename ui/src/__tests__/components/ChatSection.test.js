import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatSection from '../../components/ChatSection';

// Mock child components since we've already tested them separately
jest.mock('../../components/Message', () => {
    return function MockMessage({ message, isTyping, showTechnicalMessages }) {
        return (
            <div data-testid="message" data-role={message.role} data-typing={isTyping} data-technical={showTechnicalMessages}>
                {message.content}
            </div>
        );
    };
});

jest.mock('../../components/ValidationReport', () => {
    return function MockValidationReport({ sessionId, hasScreenshots, screenshotCount }) {
        return (
            <div data-testid="validation-report" data-session={sessionId} data-screenshots={hasScreenshots} data-count={screenshotCount}>
                Validation Report
            </div>
        );
    };
});

jest.mock('../../components/ScrollToBottomButton', () => {
    return function MockScrollToBottomButton({ showScrollButton, scrollToBottom }) {
        return (
            <button data-testid="scroll-button" data-visible={showScrollButton} onClick={scrollToBottom}>
                Scroll to Bottom
            </button>
        );
    };
});

describe('ChatSection', () => {
    const mockRef = { current: document.createElement('div') };
    const defaultProps = {
        messages: [
            { id: '1', role: 'user', content: 'Hello' },
            { id: '2', role: 'assistant', content: 'Hi there' },
            { id: '3', role: 'function', content: 'Function call' }
        ],
        loading: false,
        showTechnicalMessages: false,
        sessionId: '123',
        hasScreenshots: true,
        screenshotCount: 2,
        addStatusMessage: jest.fn(),
        handleSendMessage: jest.fn(),
        toggleTechnicalMessages: jest.fn(),
        typingMessageIds: [],
        messagesEndRef: mockRef,
        chatContainerRef: mockRef,
        inputRef: mockRef,
        showScrollButton: false,
        scrollToBottom: jest.fn(),
        handleChatScroll: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Message Display', () => {
        test('should filter out technical messages when showTechnicalMessages is false', () => {
            render(<ChatSection {...defaultProps} />);
            const messages = screen.getAllByTestId('message');
            expect(messages).toHaveLength(2); // Only user and assistant messages
            expect(screen.queryByText('Function call')).not.toBeInTheDocument();
        });

        test('should show all messages when showTechnicalMessages is true', () => {
            render(<ChatSection {...defaultProps} showTechnicalMessages={true} />);
            const messages = screen.getAllByTestId('message');
            expect(messages).toHaveLength(3); // All messages including function
            expect(screen.getByText('Function call')).toBeInTheDocument();
        });

        test('should show typing indicator for appropriate messages', () => {
            render(
                <ChatSection
                    {...defaultProps}
                    messages={[{ id: '1', role: 'assistant', content: 'Typing...', is_typing: true }]}
                />
            );
            const message = screen.getByTestId('message');
            expect(message).toHaveAttribute('data-typing', 'true');
        });
    });

    describe('Input Handling', () => {
        test('should update input value on change', () => {
            render(<ChatSection {...defaultProps} />);
            const input = screen.getByPlaceholderText('Type your message...');
            fireEvent.change(input, { target: { value: 'New message' } });
            expect(input.value).toBe('New message');
        });

        test('should disable input when loading', () => {
            render(<ChatSection {...defaultProps} loading={true} />);
            const input = screen.getByPlaceholderText('Type your message...');
            expect(input).toBeDisabled();
        });

        test('should send message on Enter and clear input', () => {
            render(<ChatSection {...defaultProps} />);
            const input = screen.getByPlaceholderText('Type your message...');

            fireEvent.change(input, { target: { value: 'Test message' } });
            fireEvent.keyDown(input, { key: 'Enter' });

            expect(defaultProps.handleSendMessage).toHaveBeenCalledWith('Test message');
            expect(input.value).toBe('');
        });

        test('should not send message on Shift+Enter', () => {
            render(<ChatSection {...defaultProps} />);
            const input = screen.getByPlaceholderText('Type your message...');

            fireEvent.change(input, { target: { value: 'Test message' } });
            fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

            expect(defaultProps.handleSendMessage).not.toHaveBeenCalled();
            expect(input.value).toBe('Test message');
        });
    });

    describe('Send Button', () => {
        test('should be disabled when input is empty', () => {
            render(<ChatSection {...defaultProps} />);
            const sendButton = screen.getByRole('button', { name: 'Send message' });
            expect(sendButton).toBeDisabled();
        });

        test('should be disabled when loading', () => {
            render(<ChatSection {...defaultProps} loading={true} />);
            const sendButton = screen.getByRole('button', { name: 'Send message' });
            expect(sendButton).toBeDisabled();
        });

        test('should send message and clear input when clicked', () => {
            render(<ChatSection {...defaultProps} />);
            const input = screen.getByPlaceholderText('Type your message...');
            const sendButton = screen.getByRole('button', { name: 'Send message' });

            fireEvent.change(input, { target: { value: 'Test message' } });
            fireEvent.click(sendButton);

            expect(defaultProps.handleSendMessage).toHaveBeenCalledWith('Test message');
            expect(input.value).toBe('');
        });
    });

    describe('Technical Messages Toggle', () => {
        test('should show correct button text based on showTechnicalMessages', () => {
            const { rerender } = render(<ChatSection {...defaultProps} />);
            expect(screen.getByText('Show Technical Details')).toBeInTheDocument();

            rerender(<ChatSection {...defaultProps} showTechnicalMessages={true} />);
            expect(screen.getByText('Hide Technical Details')).toBeInTheDocument();
        });

        test('should call toggleTechnicalMessages when clicked', () => {
            render(<ChatSection {...defaultProps} />);
            fireEvent.click(screen.getByText('Show Technical Details'));
            expect(defaultProps.toggleTechnicalMessages).toHaveBeenCalledTimes(1);
        });
    });

    describe('Validation Report', () => {
        test('should show validation report when conditions are met', () => {
            render(<ChatSection {...defaultProps} />);
            expect(screen.getByTestId('validation-report')).toBeInTheDocument();
        });

        test('should not show validation report when loading', () => {
            render(<ChatSection {...defaultProps} loading={true} />);
            expect(screen.queryByTestId('validation-report')).not.toBeInTheDocument();
        });

        test('should not show validation report without screenshots', () => {
            render(<ChatSection {...defaultProps} hasScreenshots={false} />);
            expect(screen.queryByTestId('validation-report')).not.toBeInTheDocument();
        });
    });

    describe('Scroll Button', () => {
        test('should show scroll button when showScrollButton is true', () => {
            render(<ChatSection {...defaultProps} showScrollButton={true} />);
            const scrollButton = screen.getByTestId('scroll-button');
            expect(scrollButton).toHaveAttribute('data-visible', 'true');
        });

        test('should call scrollToBottom when scroll button is clicked', () => {
            render(<ChatSection {...defaultProps} showScrollButton={true} />);
            fireEvent.click(screen.getByTestId('scroll-button'));
            expect(defaultProps.scrollToBottom).toHaveBeenCalledTimes(1);
        });
    });

    describe('Chat Container', () => {
        test('should call handleChatScroll on scroll', () => {
            render(<ChatSection {...defaultProps} />);
            const chatContainer = screen.getByTestId('chat-container');
            fireEvent.scroll(chatContainer);
            expect(defaultProps.handleChatScroll).toHaveBeenCalledTimes(1);
        });
    });
}); 