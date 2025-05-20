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

    // New state variables for AI validation
    const [aiValidating, setAiValidating] = useState(false);
    const [aiValidationStatus, setAiValidationStatus] = useState(null);
    const [aiValidationResult, setAiValidationResult] = useState(null);
    const [aiValidationError, setAiValidationError] = useState(null);
    const [aiPollInterval, setAiPollInterval] = useState(null);
    const [currentAgent, setCurrentAgent] = useState(null);

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (pollInterval) {
                clearInterval(pollInterval);
            }
            if (aiPollInterval) {
                clearInterval(aiPollInterval);
            }
        };
    }, [pollInterval, aiPollInterval]);

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

    // Start AI validation process
    const startAiValidation = async () => {
        if (!sessionId || aiValidating) return;

        try {
            setAiValidating(true);
            setAiValidationError(null);
            setAiValidationResult(null);
            setDownloadUrl(null); // Reset any existing download URL

            const response = await api.post(ENDPOINTS.VALIDATE_VIA_AI, {
                sessionId: sessionId
            });

            if (response.data.success) {
                // Start polling for AI validation status
                if (aiPollInterval) {
                    clearInterval(aiPollInterval);
                }

                const interval = setInterval(checkAiValidationStatus, 1500); //poll every 1.5 seconds
                setAiPollInterval(interval);

                // Initial status update
                setAiValidationStatus('processing');
                setCurrentAgent(response.data.agent);
            } else {
                setAiValidationError('Failed to start AI validation');
                setAiValidating(false);
            }
        } catch (err) {
            console.error('Error starting AI validation:', err);
            setAiValidationError(`Error: ${err.message}`);
            setAiValidating(false);
            if (onError) onError(err.message);
        }
    };

    // Check AI validation status and trigger report generation when complete
    const checkAiValidationStatus = async () => {
        if (!sessionId) return;

        try {
            const response = await api.get(ENDPOINTS.GET_VALIDATE_VIA_AI_STATUS(sessionId));
            const { status, result, error, agent } = response.data;

            setAiValidationStatus(status);
            setCurrentAgent(agent);

            if (error) {
                setAiValidationError(error);
                clearInterval(aiPollInterval);
                setAiPollInterval(null);
                setAiValidating(false);
                return;
            }

            if (status === 'completed') {
                setAiValidationResult(result);
                clearInterval(aiPollInterval);
                setAiPollInterval(null);
                setAiValidating(false);
                setCurrentAgent(null);

                // Automatically start report generation after AI validation completes
                if (result.finalResult === 'Pass') {
                    await startGeneration();
                }
            }
        } catch (err) {
            console.error('Error checking AI validation status:', err);
            setAiValidationError(`Error: ${err.message}`);
            clearInterval(aiPollInterval);
            setAiPollInterval(null);
            setAiValidating(false);
            setCurrentAgent(null);
            if (onError) onError(err.message);
        }
    };

    // Toggle the report modal
    const toggleReportModal = () => {
        // Reset all states when opening or closing the modal
        setDownloadUrl(null);
        setStatus(null);
        setError(null);
        setProgress(0);
        setGenerating(false);
        setAiValidationResult(null);
        setAiValidationError(null);
        setAiValidating(false);
        setCurrentAgent(null);

        // Toggle modal state
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
                title="Validate with Agent"
            >
                <span className="report-button-icon">🤖</span>
                <span className="report-button-text">Validate with Agent</span>
            </button>
        );
    }

    // Render the component (either full version or modal)
    return (
        <div className={`validation-report ${reportModalOpen ? 'modal' : ''}`}>
            {reportModalOpen && (
                <div className="modal-overlay" onClick={() => !generating && !aiValidating && setReportModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="close-modal-button"
                            onClick={() => !generating && !aiValidating && setReportModalOpen(false)}
                            title="Close"
                            disabled={generating || aiValidating}
                        >
                            ✕
                        </button>

                        <div className="validation-report-header">
                            <h3>Validation Report</h3>
                            <p>First validate with AI, then generate and download the PDF report</p>
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
                                <span className="success-icon">✓</span> Your report is ready to download!
                            </div>
                        )}

                        {!generating && !downloadUrl && !error && screenshotCount === 0 && (
                            <div className="no-screenshots-message">
                                No screenshots available yet. Take some screenshots during your session to include in the report.
                            </div>
                        )}

                        <div className="validation-report-buttons">
                            <button
                                className={`action-icon-button validate-ai ${screenshotCount === 0 ? 'disabled' : ''}`}
                                onClick={startAiValidation}
                                disabled={loading || aiValidating || screenshotCount === 0}
                                title={screenshotCount === 0 ? "No screenshots available" : "Start AI Validation"}
                            >
                                <span className="icon">🤖</span>
                                <span className="label">Validate with AI</span>
                            </button>

                            <button
                                className={`action-icon-button generate ${screenshotCount === 0 ? 'disabled' : ''}`}
                                onClick={startGeneration}
                                disabled={loading || generating || screenshotCount === 0 || aiValidating}
                                title={screenshotCount === 0 ? "No screenshots available" : downloadUrl ? "Regenerate Report" : "Generate Report"}
                            >
                                <span className="icon">📊</span>
                                <span className="label">{downloadUrl ? "Regenerate Report" : "Generate Report"}</span>
                            </button>

                            {downloadUrl && !generating && !aiValidating && (
                                <button
                                    className="action-icon-button download"
                                    onClick={downloadReport}
                                    disabled={loading}
                                    title="Download Report"
                                >
                                    <span className="icon">📥</span>
                                    <span className="label">Download Report</span>
                                </button>
                            )}
                        </div>

                        {/* AI Validation Results Section */}
                        {(aiValidating || aiValidationResult || aiValidationError) && (
                            <div className="validation-ai-section">
                                {aiValidationResult && (
                                    <div className={`validation-ai-header ${aiValidationResult.finalResult.toLowerCase()}`}>
                                        <div className="left-section">
                                            <span className="validation-ai-icon">
                                                {aiValidationResult.finalResult === 'Pass' ? '✓' :
                                                    aiValidationResult.finalResult === 'Fail' ? '×' : '?'}
                                            </span>
                                            <h4>Validation Results</h4>
                                        </div>
                                        {aiValidationResult.finalResult === 'Fail' && (
                                            <div className="tooltip-wrapper">
                                                <button
                                                    className="retry-button"
                                                    onClick={() => startAiValidation()}
                                                    aria-label="Retry validation"
                                                >
                                                    <svg
                                                        width="16"
                                                        height="16"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M 12 20 A 8 8 0 1 0 4.5 8.5 L 4.5 12" fill="none" />
                                                        <path d="M 4.5 8.5 L 1 12 L 8 12" fill="currentColor" stroke="none" />
                                                    </svg>
                                                </button>
                                                <span className="tooltip">Retry validation</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {aiValidating && (
                                    <div className="ai-validation-progress">
                                        <div className="validation-progress-steps">
                                            <div className={`validation-progress-step ${currentAgent === 'test-planner' || currentAgent === null ? 'active' : currentAgent === 'qa-validator' ? 'completed' : ''}`}>
                                                <div className="progress-step-icon">🧠</div>
                                                <p>{currentAgent === 'test-planner' ? 'Planning' : currentAgent === 'qa-validator' ? 'Planned' : 'Planner'}</p>
                                            </div>
                                            <div className={`validation-progress-step ${currentAgent === 'qa-validator' ? 'active' : ''}`}>
                                                <div className="progress-step-icon">🔍</div>
                                                <p>{currentAgent === 'qa-validator' ? 'Validating' : 'Validator'}</p>
                                            </div>
                                            {/* <div className={`validation-progress-step ${currentAgent === 'qa-reviewer' ? 'active' : ''}`}>
                                                <div className="progress-step-icon">🧐</div>
                                                <p>{currentAgent === 'qa-reviewer' ? 'Reviewing' : 'Reviewer'}</p>
                                            </div> */}
                                        </div>
                                    </div>
                                )}

                                {aiValidationError && (
                                    <div className="ai-validation-error">
                                        {aiValidationError}
                                    </div>
                                )}

                                {aiValidationResult && (
                                    <div className="ai-validation-result">
                                        <div className="validation-steps">
                                            {aiValidationResult.steps.map((step, index) => (
                                                <div key={index} className={`validation-step ${step.status}`}>
                                                    <div className="step-header">
                                                        <span className="step-number">{index + 1}</span>
                                                        <span className="step-title">{step.step}</span>
                                                        <span className="step-status">
                                                            {step.status === 'passed' ? '✓' :
                                                                step.status === 'failed' ? '×' : '?'}
                                                        </span>
                                                    </div>
                                                    <div className="step-explanation">
                                                        {step.explanation}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ValidationReport; 