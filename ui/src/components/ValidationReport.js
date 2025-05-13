import React, { useState, useEffect } from 'react';
import api from '../api'
import { ENDPOINTS } from '../constants';
import './ValidationReport.css';

/**
 * ValidationReport Component - Compact version for chat header
 * Handles generating and downloading validation reports for a session
 */
const ValidationReport = ({
    sessionId,
    onError,
    compact = true,
    hasScreenshots = false,
    screenshotCount = 0
}) => {
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);
    const [pollInterval, setPollInterval] = useState(null);
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState(null);

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [pollInterval]);

    // Check validation report status
    const checkStatus = async () => {
        if (!sessionId) return;

        try {
            setLoading(true);
            const response = await api.get(ENDPOINTS.GET_VALIDATION_REPORT_STATUS(sessionId));

            if (response.data.success) {
                setStatus(response.data);
                setProgress(response.data.progress || 0);

                // Store download URL if available
                if (response.data.downloadUrl) {
                    setDownloadUrl(response.data.downloadUrl);
                }

                // If report generation is complete or failed, stop polling
                if (response.data.status === 'completed' || response.data.status === 'failed') {
                    clearInterval(pollInterval);
                    setPollInterval(null);

                    setGenerating(false);

                    if (response.data.status === 'failed') {
                        setError(`Report generation failed: ${response.data.error || 'Unknown error'}`);
                    } else {
                        setError(null);
                    }
                }
            } else {
                setError('Failed to check report status');
            }
        } catch (err) {
            console.error('Error checking report status:', err);
            setError(`Error: ${err.message}`);
            if (onError) onError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Start report generation in the background
    const startGeneration = async () => {
        if (!sessionId || generating) return;

        try {
            setGenerating(true);
            setError(null);
            setReportModalOpen(true);
            setDownloadUrl(null); // Reset download URL

            const response = await api.post(ENDPOINTS.GENERATE_VALIDATION_REPORT(sessionId));

            if (response.data.success) {
                // Start polling for status
                if (pollInterval) {
                    clearInterval(pollInterval);
                }

                // Poll more frequently at first, then slow down
                const interval = setInterval(checkStatus, 2000);
                setPollInterval(interval);

                // Initial status update
                setStatus(response.data);
                setProgress(0);
            } else {
                setError('Failed to start report generation');
                setGenerating(false);
            }
        } catch (err) {
            console.error('Error starting report generation:', err);
            setError(`Error: ${err.message}`);
            setGenerating(false);
            if (onError) onError(err.message);
        }
    };

    // Download the generated report using the URL from Firebase Storage
    const downloadReport = async () => {
        if (!sessionId) return;

        try {
            setLoading(true);

            // If we have a download URL, use it to download via the new API
            if (downloadUrl) {
                const response = await api.post(ENDPOINTS.DOWNLOAD_VALIDATION_REPORT, {
                    fileUrl: downloadUrl,
                    sessionId: sessionId
                }, {
                    responseType: 'blob'
                });

                // Create blob URL and trigger download
                const blob = new Blob([response.data], { type: 'application/pdf' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `validation-report-${sessionId}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

            } else {
                // Check status to get fresh download URL
                const statusResponse = await api.get(ENDPOINTS.GET_VALIDATION_REPORT_STATUS(sessionId));

                if (statusResponse.data.success && statusResponse.data.downloadUrl) {
                    setDownloadUrl(statusResponse.data.downloadUrl);
                    const response = await api.post(ENDPOINTS.DOWNLOAD_VALIDATION_REPORT, {
                        fileUrl: statusResponse.data.downloadUrl,
                        sessionId: sessionId
                    }, {
                        responseType: 'blob'
                    });

                    // Create blob URL and trigger download
                    const blob = new Blob([response.data], { type: 'application/pdf' });
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `validation-report-${sessionId}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                } else {
                    throw new Error('No download URL available');
                }
            }
        } catch (err) {
            console.error('Error downloading report:', err);
            setError(`Error: ${err.message}`);
            if (onError) onError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Toggle the report modal
    const toggleReportModal = () => {
        // Check status when opening the modal
        if (!reportModalOpen) {
            setDownloadUrl(null);
            checkStatus();
        }
        setReportModalOpen(!reportModalOpen);
    };

    // Don't render anything if there are no screenshots and we're in compact mode
    if (compact && !reportModalOpen && !hasScreenshots) {
        return null;
    }

    // Render the compact version for the chat header
    if (compact && !reportModalOpen) {
        return (
            <button
                className="report-button"
                onClick={toggleReportModal}
                title="Generate Validation Report"
            >
                <span className="report-button-icon">📊</span>
                <span className="report-button-text">Validation Report</span>
            </button>
        );
    }

    // Render the component (either full version or modal)
    return (
        <div className={`validation-report ${reportModalOpen ? 'modal' : ''}`}>
            {reportModalOpen && (
                <div className="modal-overlay" onClick={() => !generating && setReportModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="close-modal-button"
                            onClick={() => !generating && setReportModalOpen(false)}
                            title="Close"
                        >
                            ✕
                        </button>

                        <div className="validation-report-header">
                            <h3>Validation Report</h3>
                            <p>Generate and download a PDF report with screenshots and chat history</p>
                        </div>

                        {error && (
                            <div className="validation-report-error">
                                {error}
                            </div>
                        )}

                        {generating && (
                            <div className="validation-report-progress">
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar"
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                                <div className="progress-status">
                                    {status?.statusMessage || `Generating report (${progress}%)`}
                                </div>
                                <div className="progress-time">
                                    {status?.estimatedTimeSeconds ? `Estimated time: ${Math.ceil(status.estimatedTimeSeconds)} seconds` : ''}
                                </div>
                            </div>
                        )}

                        {downloadUrl && !generating && !error && (
                            <div className="download-ready-message">
                                Your report is ready to download!
                            </div>
                        )}

                        {!generating && !downloadUrl && !error && screenshotCount === 0 && (
                            <div className="no-screenshots-message">
                                No screenshots available yet. Take some screenshots during your session to include in the report.
                            </div>
                        )}

                        <div className="validation-report-buttons">
                            {!generating && (
                                <button
                                    className={`action-icon-button generate ${screenshotCount === 0 ? 'disabled' : ''}`}
                                    onClick={startGeneration}
                                    disabled={loading || generating || screenshotCount === 0}
                                    title={screenshotCount === 0 ? "No screenshots available" : "Generate Report"}
                                >
                                    <span className="icon">📊</span>
                                    <span className="label">Generate</span>
                                </button>
                            )}

                            {(status?.status === 'completed' || downloadUrl) && (
                                <button
                                    className="action-icon-button download"
                                    onClick={downloadReport}
                                    disabled={loading}
                                    title="Download Report"
                                >
                                    <span className="icon">📥</span>
                                    <span className="label">Download</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ValidationReport; 