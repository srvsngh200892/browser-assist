import React from 'react';

function ScrollToBottomButton({ showScrollButton, scrollToBottom }) {
    return (
        showScrollButton && (
            <div className="scroll-button-wrapper">
                <button
                    className="scroll-button"
                    onClick={scrollToBottom}
                >
                    ↓
                </button>
            </div>
        )
    );
}

export default ScrollToBottomButton;
