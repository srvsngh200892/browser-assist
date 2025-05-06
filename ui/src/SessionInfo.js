import React, { useState, useEffect } from 'react';
import './SessionInfo.css';
import api from './api'

/**
 * Session Information Component
 * Displays metadata about the current session from Firebase
 */
const SessionInfo = ({ sessionId, onError }) => {
    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isActive, setIsActive] = useState(false);

    // Fetch session info when sessionId changes
    useEffect(() => {
        if (!sessionId) {
            setSessionData(null);
            setLoading(false);
            setIsActive(false);
            return;
        }

        const fetchSessionInfo = async () => {
            try {
                setLoading(true);

                const response = await api.get(`/api/session/${sessionId}`);

                if (response.data.success) {
                    setSessionData(response.data.session);
                    setLastUpdated(new Date());
                    setIsActive(response.data.session.status === 'active');
                    setError(null);
                } else {
                    setError('Failed to load session information');
                    setIsActive(false);
                    if (onError) onError('Failed to load session information');
                }
            } catch (err) {
                console.error('Error fetching session info:', err);
                setError(`Error: ${err.message}`);
                setIsActive(false);
                if (onError) onError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchSessionInfo();

        // Set up polling interval to refresh session data
        const intervalId = setInterval(fetchSessionInfo, 60000); // Every 30 seconds

        return () => clearInterval(intervalId);
    }, [sessionId, onError]);

    // Format timestamps
    const formatTime = (timestamp) => {
        if (!timestamp || !timestamp._seconds) return 'N/A';
        const date = new Date(timestamp._seconds * 1000);
        return date.toLocaleString();
    };

    // Format relative time (e.g., "2 minutes ago")
    const getRelativeTime = (timestamp) => {
        if (!timestamp || !timestamp._seconds) return 'N/A';

        const now = new Date();
        const then = new Date(timestamp._seconds * 1000);
        const diffInSeconds = Math.floor((now - then) / 1000);

        if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        return `${Math.floor(diffInSeconds / 86400)} days ago`;
    };

    // Format elapsed time between two timestamps
    const getElapsedTime = (start, end) => {
        if (!start || !start._seconds) return 'N/A';

        const startDate = new Date(start._seconds * 1000);
        const endDate = end && end._seconds ? new Date(end._seconds * 1000) : new Date();

        const diffInSeconds = Math.floor((endDate - startDate) / 1000);

        const hours = Math.floor(diffInSeconds / 3600);
        const minutes = Math.floor((diffInSeconds % 3600) / 60);
        const seconds = diffInSeconds % 60;

        return `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;
    };

    // Toggle expanded state
    const toggleExpand = () => {
        setExpanded(!expanded);
    };

    if (loading && !sessionData) {
        return (
            <div className="session-info session-info-loading">
                <div className="session-info-header">
                    <div className="session-info-header-left">
                        <div className="loading-spinner small"></div>
                        <h3>Session Information</h3>
                    </div>
                </div>
                <p>Loading session data...</p>
            </div>
        );
    }

    if (error && !sessionData) {
        return (
            <div className={`session-info session-info-error ${expanded ? 'expanded' : 'collapsed'}`}>
                <div className="session-info-header" onClick={toggleExpand}>
                    <div className="session-info-header-left">
                        <div className="session-status-indicator error"></div>
                        <h3>Session Information</h3>
                    </div>
                    <span className="session-info-toggle">{expanded ? '▼' : '▶'}</span>
                </div>
                {expanded && (
                    <div className="session-info-content">
                        <div className="session-info-item">
                            <span className="session-info-label">Status:</span>
                            <div className="session-info-status-wrapper">
                                <div className="session-status-indicator error"></div>
                                <span className="session-info-value session-status-expired">
                                    Error
                                </span>
                            </div>
                        </div>
                        <div className="session-info-item">
                            <span className="session-info-label">Error Message:</span>
                            <div className="session-info-value">
                                <div className="session-info-error-message">
                                    <p>{error}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (!sessionData) {
        return (
            <div className="session-info session-info-empty">
                <div className="session-info-header">
                    <div className="session-info-header-left">
                        <div className="session-status-indicator inactive"></div>
                        <h3>Session Information</h3>
                    </div>
                    <span className="session-info-toggle">▶</span>
                </div>
                <p>No active session</p>
            </div>
        );
    }

    return (
        <div className={`session-info ${expanded ? 'expanded' : 'collapsed'}`}>
            <div className="session-info-header" onClick={toggleExpand}>
                <div className="session-info-header-left">
                    <div className={`session-status-indicator ${isActive ? 'active' : 'inactive'}`}></div>
                    <h3>Session Information</h3>
                </div>
                <span className="session-info-toggle">{expanded ? '▼' : '▶'}</span>
            </div>

            {expanded && (
                <div className="session-info-content">
                    <div className="session-info-item">
                        <span className="session-info-label">Session ID:</span>
                        <span className="session-info-value">{sessionData.sessionId.substring(0, 8)}...</span>
                    </div>

                    <div className="session-info-item">
                        <span className="session-info-label">Status:</span>
                        <div className="session-info-status-wrapper">
                            <div className={`session-status-indicator ${isActive ? 'active' : 'inactive'}`}></div>
                            <span className={`session-info-value session-status-${sessionData.status}`}>
                                {isActive ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>

                    <div className="session-info-item">
                        <span className="session-info-label">Created:</span>
                        <span className="session-info-value" title={formatTime(sessionData.createdAt)}>
                            {getRelativeTime(sessionData.createdAt)}
                        </span>
                    </div>

                    <div className="session-info-item">
                        <span className="session-info-label">Last Active:</span>
                        <span className="session-info-value" title={formatTime(sessionData.lastActive)}>
                            {getRelativeTime(sessionData.lastActive)}
                        </span>
                    </div>

                    <div className="session-info-item">
                        <span className="session-info-label">Session Duration:</span>
                        <span className="session-info-value">
                            {getElapsedTime(sessionData.createdAt, sessionData.lastActive)}
                        </span>
                    </div>

                    {sessionData.metadata && sessionData.metadata.userAgent && (
                        <div className="session-info-item">
                            <span className="session-info-label">Browser:</span>
                            <span className="session-info-value session-info-useragent" title={sessionData.metadata.userAgent}>
                                {sessionData.metadata.userAgent.split(' ')[0]}
                            </span>
                        </div>
                    )}

                    {lastUpdated && (
                        <div className="session-info-footer">
                            Last updated: {lastUpdated.toLocaleTimeString()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SessionInfo; 