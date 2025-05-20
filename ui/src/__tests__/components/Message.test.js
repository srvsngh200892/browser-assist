import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Message from '../../components/Message';

describe('Message', () => {
    describe('Role Icons', () => {
        test('should display correct icon for assistant role', () => {
            render(<Message message={{ role: 'assistant', content: 'Hello' }} />);
            expect(screen.getByText('🤖')).toBeInTheDocument();
        });

        test('should display correct icon for user role', () => {
            render(<Message message={{ role: 'user', content: 'Hi' }} />);
            expect(screen.getByText('👤')).toBeInTheDocument();
        });

        test('should display correct icon for system role', () => {
            render(<Message message={{ role: 'system', content: 'System message' }} />);
            expect(screen.getByText('⚙️')).toBeInTheDocument();
        });

        test('should display correct icon for function/tool role based on content', () => {
            const screenshotMessage = {
                role: 'function',
                tool_call_id: '123',
                content: 'Taking a screenshot'
            };
            const { rerender } = render(<Message message={screenshotMessage} />);
            expect(screen.getByText('📷')).toBeInTheDocument();

            // Test click-related content
            rerender(<Message message={{ ...screenshotMessage, content: 'Clicking button' }} />);
            expect(screen.getByText('👆')).toBeInTheDocument();

            // Test type-related content (without the word 'text')
            rerender(<Message message={{ ...screenshotMessage, content: 'Typing input' }} />);
            expect(screen.getByText('⌨️')).toBeInTheDocument();
        });
    });

    describe('Message Content', () => {
        test('should render message content correctly', () => {
            const message = {
                role: 'assistant',
                content: 'Hello, how can I help?'
            };
            render(<Message message={message} />);
            expect(screen.getByText('Hello, how can I help?')).toBeInTheDocument();
        });

        test('should render empty message placeholder', () => {
            const message = {
                role: 'assistant',
                content: ''
            };
            render(<Message message={message} />);
            expect(screen.getByText('[Empty Message]')).toBeInTheDocument();
        });

        test('should render tool content in pre tag', () => {
            const message = {
                role: 'function',
                content: 'Tool output'
            };
            render(<Message message={message} />);
            expect(screen.getByText('Tool output')).toBeInTheDocument();
            expect(screen.getByText('Tool output').tagName).toBe('PRE');
        });
    });

    describe('Typing Indicator', () => {
        test('should show typing indicator when isTyping is true', () => {
            render(<Message message={{ role: 'assistant' }} isTyping={true} />);
            expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
        });

        test('should not show typing indicator when isTyping is false', () => {
            render(<Message message={{ role: 'assistant' }} isTyping={false} />);
            expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
        });
    });

    describe('Tool Calls', () => {
        test('should render tool calls section when present', () => {
            const message = {
                role: 'assistant',
                content: 'Using tools',
                tool_calls: [{
                    id: '123',
                    function: {
                        name: 'screenshot',
                        arguments: '{"selector": "#main"}'
                    }
                }]
            };
            render(<Message message={message} typingMessageIds={[]} />);
            expect(screen.getByText('🔧 Tool Calls:')).toBeInTheDocument();
            expect(screen.getByText('screenshot')).toBeInTheDocument();
        });

        test('should render tool calls with correct icons', () => {
            const message = {
                role: 'assistant',
                content: 'Using tools',
                tool_calls: [
                    {
                        id: '123',
                        function: {
                            name: 'screenshot',
                            arguments: '{}'
                        }
                    },
                    {
                        id: '124',
                        function: {
                            name: 'click_element',
                            arguments: '{}'
                        }
                    }
                ]
            };
            render(<Message message={message} typingMessageIds={[]} />);
            expect(screen.getByText('📷')).toBeInTheDocument(); // Screenshot icon
            expect(screen.getByText('👆')).toBeInTheDocument(); // Click icon
        });
    });

    describe('Technical Messages', () => {
        test('should show finish reason when showTechnicalMessages is true', () => {
            const message = {
                role: 'assistant',
                content: 'Hello',
                finish_reason: 'stop'
            };
            render(<Message message={message} showTechnicalMessages={true} />);
            expect(screen.getByText('Finish reason: stop')).toBeInTheDocument();
        });

        test('should not show finish reason when showTechnicalMessages is false', () => {
            const message = {
                role: 'assistant',
                content: 'Hello',
                finish_reason: 'stop'
            };
            render(<Message message={message} showTechnicalMessages={false} />);
            expect(screen.queryByText('Finish reason: stop')).not.toBeInTheDocument();
        });
    });
}); 