import React from 'react';

function StatusLog({ statusMessages }) {
    return (
        <div className="status-log">
            <h3>Status Log</h3>
            <div className="status-messages">
                {statusMessages.length === 0 ? (
                    <div className="status-message info" data-testid="status-message">
                        <span className="status-time">--:--:--</span>
                        <span className="status-text" data-testid="status-text">Waiting for activity...</span>
                    </div>
                ) : (
                    statusMessages.map((status, index) => (
                        <div key={index} className={`status-message ${status.type}`} data-testid="status-message">
                            <span className="status-time">{status.time}</span>
                            <span className="status-text" data-testid="status-text">{status.text}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default StatusLog;
