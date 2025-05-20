import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusLog from '../../components/StatusLog';

describe('StatusLog', () => {
    test('should render default message when no status messages are provided', () => {
        render(<StatusLog statusMessages={[]} />);

        expect(screen.getByText('Status Log')).toBeInTheDocument();
        expect(screen.getByText('--:--:--')).toBeInTheDocument();
        expect(screen.getByText('Waiting for activity...')).toBeInTheDocument();
    });

    test('should render status messages when provided', () => {
        const mockMessages = [
            { time: '10:00:00', text: 'First message', type: 'info' },
            { time: '10:01:00', text: 'Second message', type: 'error' }
        ];

        render(<StatusLog statusMessages={mockMessages} />);

        // Check if all messages are rendered
        expect(screen.getByText('10:00:00')).toBeInTheDocument();
        expect(screen.getByText('First message')).toBeInTheDocument();
        expect(screen.getByText('10:01:00')).toBeInTheDocument();
        expect(screen.getByText('Second message')).toBeInTheDocument();

        // Check if messages have correct type classes
        const messages = screen.getAllByTestId('status-message');
        expect(messages[0]).toHaveClass('status-message', 'info');
        expect(messages[1]).toHaveClass('status-message', 'error');
    });

    test('should render messages in the correct order', () => {
        const mockMessages = [
            { time: '10:00:00', text: 'First message', type: 'info' },
            { time: '10:01:00', text: 'Second message', type: 'error' }
        ];

        render(<StatusLog statusMessages={mockMessages} />);

        const messageTexts = screen.getAllByTestId('status-text');
        expect(messageTexts[0]).toHaveTextContent('First message');
        expect(messageTexts[1]).toHaveTextContent('Second message');
    });
}); 