import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PreviewSection from '../../components/PreviewSection';

// Mock the StatusLog component since we've already tested it separately
jest.mock('../../components/StatusLog', () => {
    return function MockStatusLog({ statusMessages }) {
        return <div data-testid="status-log" data-messages={JSON.stringify(statusMessages)} />;
    };
});

describe('PreviewSection', () => {
    const defaultProps = {
        previewVisible: true,
        browserImage: 'test-image.png',
        streaming: false,
        streamStatus: 'inactive',
        sessionId: '123',
        takeScreenshot: jest.fn(),
        startStream: jest.fn(),
        stopStream: jest.fn(),
        restartStream: jest.fn(),
        statusMessages: []
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Visibility', () => {
        test('should be visible when previewVisible is true', () => {
            render(<PreviewSection {...defaultProps} />);
            const section = screen.getByTestId('preview-section');
            expect(section).not.toHaveClass('hidden');
        });

        test('should be hidden when previewVisible is false', () => {
            render(<PreviewSection {...defaultProps} previewVisible={false} />);
            const section = screen.getByTestId('preview-section');
            expect(section).toHaveClass('hidden');
        });
    });

    describe('Screenshot Button', () => {
        test('should be enabled when sessionId exists and not streaming', () => {
            render(<PreviewSection {...defaultProps} />);
            const button = screen.getByText('Refresh Screenshot');
            expect(button).toBeEnabled();
        });

        test('should be disabled when streaming', () => {
            render(<PreviewSection {...defaultProps} streaming={true} />);
            const button = screen.getByText('Refresh Screenshot');
            expect(button).toBeDisabled();
        });

        test('should be disabled when no sessionId', () => {
            render(<PreviewSection {...defaultProps} sessionId="" />);
            const button = screen.getByText('Refresh Screenshot');
            expect(button).toBeDisabled();
        });

        test('should call takeScreenshot when clicked', () => {
            render(<PreviewSection {...defaultProps} />);
            const button = screen.getByText('Refresh Screenshot');
            fireEvent.click(button);
            expect(defaultProps.takeScreenshot).toHaveBeenCalledTimes(1);
        });
    });

    describe('Stream Button', () => {
        test('should show "Start Stream" when not streaming', () => {
            render(<PreviewSection {...defaultProps} />);
            expect(screen.getByText('Start Stream')).toBeInTheDocument();
        });

        test('should show "Stop Stream" when streaming', () => {
            render(<PreviewSection {...defaultProps} streaming={true} />);
            expect(screen.getByText('Stop Stream')).toBeInTheDocument();
        });

        test('should be disabled when connecting', () => {
            render(<PreviewSection {...defaultProps} streamStatus="connecting" />);
            const button = screen.getByText('Start Stream');
            expect(button).toBeDisabled();
        });

        test('should call appropriate function when clicked', () => {
            const { rerender } = render(<PreviewSection {...defaultProps} />);

            // Test start stream
            fireEvent.click(screen.getByText('Start Stream'));
            expect(defaultProps.startStream).toHaveBeenCalledTimes(1);

            // Test stop stream
            rerender(<PreviewSection {...defaultProps} streaming={true} />);
            fireEvent.click(screen.getByText('Stop Stream'));
            expect(defaultProps.stopStream).toHaveBeenCalledTimes(1);
        });
    });

    describe('Stream Status', () => {
        test('should display current status with proper capitalization', () => {
            render(<PreviewSection {...defaultProps} streamStatus="active" />);
            expect(screen.getByText('Stream Status: Active')).toBeInTheDocument();
        });

        test('should have pulsing class when status is active or waiting', () => {
            const { rerender } = render(<PreviewSection {...defaultProps} streamStatus="active" />);
            expect(screen.getByTestId('stream-status')).toHaveClass('pulsing');

            rerender(<PreviewSection {...defaultProps} streamStatus="waiting" />);
            expect(screen.getByTestId('stream-status')).toHaveClass('pulsing');

            rerender(<PreviewSection {...defaultProps} streamStatus="inactive" />);
            expect(screen.getByTestId('stream-status')).not.toHaveClass('pulsing');
        });
    });

    describe('Preview Image', () => {
        test('should display the browser image', () => {
            render(<PreviewSection {...defaultProps} />);
            const image = screen.getByAltText('Browser Preview');
            expect(image).toHaveAttribute('src', 'test-image.png');
        });
    });

    describe('Status Log Integration', () => {
        test('should pass status messages to StatusLog component', () => {
            const statusMessages = [
                { time: '10:00', text: 'Test message', type: 'info' }
            ];
            render(<PreviewSection {...defaultProps} statusMessages={statusMessages} />);
            const statusLog = screen.getByTestId('status-log');
            expect(statusLog).toHaveAttribute('data-messages', JSON.stringify(statusMessages));
        });
    });
}); 