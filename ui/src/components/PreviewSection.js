import React from 'react';
import StatusLog from './StatusLog';

function PreviewSection({
    previewVisible,
    browserImage,
    streaming,
    streamStatus,
    sessionId,
    takeScreenshot,
    startStream,
    stopStream,
    restartStream,
    statusMessages
}) {
    return (
        <div className={`preview-section ${previewVisible ? '' : 'hidden'}`} data-testid="preview-section">
            <div className="preview-title">
                <h2>Live Preview</h2>
                <div className="preview-controls">
                    <button
                        className="refresh-preview-button"
                        onClick={takeScreenshot}
                        disabled={!sessionId || streaming}
                    >
                        Refresh Screenshot
                    </button>
                    <button
                        className={`stream-button ${!streaming ? 'start' : streaming ? 'stop' : 'restart'}`}
                        onClick={!streaming ? startStream : streaming ? stopStream : restartStream}
                        disabled={!sessionId || streamStatus === 'connecting'}
                    >
                        {!streaming ? 'Start Stream' : streaming ? 'Stop Stream' : 'Restart Stream'}
                    </button>
                </div>
            </div>
            <div
                className={`stream-status ${streamStatus} ${(streamStatus === 'active' || streamStatus === 'waiting') ? 'pulsing' : ''}`}
                data-testid="stream-status"
            >
                Stream Status: {streamStatus.charAt(0).toUpperCase() + streamStatus.slice(1)}
            </div>
            <div className="browser-preview">
                <img src={browserImage} alt="Browser Preview" />
            </div>
            <StatusLog statusMessages={statusMessages} />
        </div>
    );
}

export default PreviewSection;
