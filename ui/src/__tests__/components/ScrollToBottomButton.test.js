import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScrollToBottomButton from '../../components/ScrollToBottomButton';

describe('ScrollToBottomButton', () => {
    test('should not render when showScrollButton is false', () => {
        render(
            <ScrollToBottomButton
                showScrollButton={false}
                scrollToBottom={() => { }}
            />
        );

        const button = screen.queryByRole('button');
        expect(button).not.toBeInTheDocument();
    });

    test('should render when showScrollButton is true', () => {
        render(
            <ScrollToBottomButton
                showScrollButton={true}
                scrollToBottom={() => { }}
            />
        );

        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
        expect(button).toHaveTextContent('↓');
    });

    test('should call scrollToBottom when clicked', () => {
        const mockScrollToBottom = jest.fn();
        render(
            <ScrollToBottomButton
                showScrollButton={true}
                scrollToBottom={mockScrollToBottom}
            />
        );

        const button = screen.getByRole('button');
        fireEvent.click(button);
        expect(mockScrollToBottom).toHaveBeenCalledTimes(1);
    });
}); 