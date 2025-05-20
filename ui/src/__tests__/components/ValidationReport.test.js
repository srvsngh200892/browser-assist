import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ValidationReport from '../../components/ValidationReport';
import api from '../../api';
import { ENDPOINTS } from '../../constants';

// Mock the api module and ENDPOINTS
jest.mock('../../api', () => ({
    get: jest.fn(),
    post: jest.fn()
}));

jest.mock('../../constants', () => ({
    ENDPOINTS: {
        VALIDATE_VIA_AI: '/api/validate-via-ai',
        GET_VALIDATE_VIA_AI_STATUS: (sessionId) => `/api/validate-via-ai/${sessionId}/status`,
        GENERATE_VALIDATION_REPORT: (sessionId) => `/api/validation/report/${sessionId}/generate`,
        GET_VALIDATION_REPORT_STATUS: (sessionId) => `/api/validation/report/${sessionId}/status`,
        DOWNLOAD_VALIDATION_REPORT: '/api/validation/report/download'
    }
}));

describe('ValidationReport', () => {
    const defaultProps = {
        sessionId: 'test-session-123',
        onError: jest.fn(),
        compact: true,
        hasScreenshots: true,
        screenshotCount: 2
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Initial Render', () => {
        test('should render in compact mode by default', () => {
            render(<ValidationReport {...defaultProps} />);
            expect(screen.getByRole('button', { name: /Validate with Agent/i })).toBeInTheDocument();
            expect(screen.getByRole('button')).toHaveClass('report-button');
        });

        test('should show robot icon in compact mode', () => {
            render(<ValidationReport {...defaultProps} />);
            expect(screen.getByText('🤖')).toBeInTheDocument();
        });

        test('should not render when no screenshots available', () => {
            render(<ValidationReport {...defaultProps} hasScreenshots={false} screenshotCount={0} />);
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });

    describe('Modal Interaction', () => {
        test('should open modal when button clicked', () => {
            render(<ValidationReport {...defaultProps} />);
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));
            expect(screen.getByRole('heading', { name: /Validation Report/i })).toBeInTheDocument();
        });

        test('should close modal when close button clicked', () => {
            render(<ValidationReport {...defaultProps} />);
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));
            fireEvent.click(screen.getByTitle('Close'));
            expect(screen.queryByRole('heading', { name: /Validation Report/i })).not.toBeInTheDocument();
        });

        test('should show no screenshots message when count is 0', () => {
            render(<ValidationReport {...defaultProps} screenshotCount={0} />);
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));
            expect(screen.getByText(/No screenshots available/i)).toBeInTheDocument();
        });
    });

    describe('AI Validation', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should start AI validation when clicked', async () => {
            api.post.mockResolvedValueOnce({
                data: {
                    success: true,
                    agent: 'test-planner'
                }
            });

            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click AI validation button
            const validateButton = screen.getByRole('button', { name: /Validate with AI/i });
            await act(async () => {
                fireEvent.click(validateButton);
                await Promise.resolve(); // Flush promises
            });

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(ENDPOINTS.VALIDATE_VIA_AI, {
                    sessionId: 'test-session-123'
                });
            });
        });

        test('should show validation progress', async () => {
            // Mock successful validation start
            api.post.mockResolvedValueOnce({
                data: {
                    success: true,
                    agent: 'test-planner'
                }
            });

            // Mock validation status checks
            api.get
                .mockResolvedValueOnce({
                    data: {
                        status: 'processing',
                        progress: 75,
                        agent: 'qa-validator'
                    }
                })
                .mockResolvedValueOnce({
                    data: {
                        status: 'completed',
                        progress: 100,
                        agent: 'qa-validator',
                        finalResult: {
                            status: 'passed',
                            steps: []
                        }
                    }
                });

            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click AI validation button
            const validateButton = screen.getByRole('button', { name: /Validate with AI/i });
            await act(async () => {
                fireEvent.click(validateButton);
                await Promise.resolve(); // Flush promises
            });

            // Wait for validation progress
            await waitFor(() => {
                expect(screen.getByTestId('validation-progress-bar')).toBeInTheDocument();
                expect(screen.getByTestId('validation-progress-bar')).toHaveStyle({ width: '75%' });
            }, { timeout: 2000 });
        });

        test('should handle validation errors', async () => {
            api.post.mockRejectedValueOnce(new Error('Validation failed'));
            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click AI validation button
            const validateButton = screen.getByRole('button', { name: /Validate with AI/i });
            await act(async () => {
                fireEvent.click(validateButton);
                await Promise.resolve(); // Flush promises
            });

            await waitFor(() => {
                expect(screen.getByText(/Error: Validation failed/i)).toBeInTheDocument();
            });
        });
    });

    describe('Report Generation', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.clearAllMocks();
        });

        test('should start report generation when clicked', async () => {
            api.post.mockResolvedValueOnce({
                data: {
                    success: true,
                    status: 'processing',
                    progress: 0
                }
            });

            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click generate report button
            const generateButton = screen.getByRole('button', { name: /Generate Report/i });
            await act(async () => {
                fireEvent.click(generateButton);
                await Promise.resolve();
            });

            await waitFor(() => {
                expect(api.post).toHaveBeenCalledWith(
                    `/api/validation/report/${defaultProps.sessionId}/generate`
                );
            });
        });

        test('should show download button when report is ready', async () => {
            // Mock successful report generation
            api.post.mockResolvedValueOnce({
                data: {
                    success: true,
                    status: 'processing',
                    progress: 0
                }
            });

            // Mock status check to return completed status
            api.get.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    downloadUrl: 'test-url',
                    progress: 100
                }
            });

            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click generate report button
            const generateButton = screen.getByRole('button', { name: /Generate Report/i });
            await act(async () => {
                fireEvent.click(generateButton);
                await Promise.resolve();
            });

            // Advance timers to trigger status check
            await act(async () => {
                jest.advanceTimersByTime(2000);
                await Promise.resolve();
            });

            // Wait for download button
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Download Report/i })).toBeInTheDocument();
                expect(screen.getByText('Your report is ready to download!')).toBeInTheDocument();
            });
        });

        test('should handle generation errors', async () => {
            api.post.mockRejectedValueOnce(new Error('Generation failed'));
            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click generate report button
            const generateButton = screen.getByRole('button', { name: /Generate Report/i });
            await act(async () => {
                fireEvent.click(generateButton);
                await Promise.resolve();
            });

            await waitFor(() => {
                expect(screen.getByText(/Error: Generation failed/i)).toBeInTheDocument();
            });
        });
    });

    describe('Report Download', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            // Mock window.location
            delete window.location;
            window.location = { href: '' };
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.clearAllMocks();
        });

        test('should download report when clicked', async () => {
            // Mock successful report generation
            api.post.mockResolvedValueOnce({
                data: {
                    success: true,
                    status: 'processing',
                    progress: 0
                }
            });

            // Mock status check
            api.get.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    downloadUrl: 'test-url',
                    progress: 100
                }
            });

            // Mock download API call
            api.post.mockResolvedValueOnce({
                data: new Blob(['test data'], { type: 'application/pdf' })
            });

            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click generate report button
            const generateButton = screen.getByRole('button', { name: /Generate Report/i });
            await act(async () => {
                fireEvent.click(generateButton);
                await Promise.resolve();
            });

            // Advance timers to trigger status check
            await act(async () => {
                jest.advanceTimersByTime(2000);
                await Promise.resolve();
            });

            // Wait for and click download button
            await waitFor(() => {
                const downloadButton = screen.getByRole('button', { name: /Download Report/i });
                expect(downloadButton).toBeInTheDocument();
                fireEvent.click(downloadButton);
            });

            // Verify the download API was called correctly
            expect(api.post).toHaveBeenLastCalledWith(
                ENDPOINTS.DOWNLOAD_VALIDATION_REPORT,
                {
                    fileUrl: 'test-url',
                    sessionId: defaultProps.sessionId
                },
                { responseType: 'blob' }
            );
        });

        test('should handle download errors', async () => {
            // Mock successful report generation
            api.post.mockResolvedValueOnce({
                data: {
                    success: true,
                    status: 'processing',
                    progress: 0
                }
            });

            // Mock status check
            api.get.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    downloadUrl: 'test-url',
                    progress: 100
                }
            });

            // Mock download API error
            api.post.mockRejectedValueOnce(new Error('Download failed'));

            render(<ValidationReport {...defaultProps} />);

            // Open modal
            fireEvent.click(screen.getByRole('button', { name: /Validate with Agent/i }));

            // Click generate report button
            const generateButton = screen.getByRole('button', { name: /Generate Report/i });
            await act(async () => {
                fireEvent.click(generateButton);
                await Promise.resolve();
            });

            // Advance timers to trigger status check
            await act(async () => {
                jest.advanceTimersByTime(2000);
                await Promise.resolve();
            });

            // Wait for and click download button
            await waitFor(() => {
                const downloadButton = screen.getByRole('button', { name: /Download Report/i });
                expect(downloadButton).toBeInTheDocument();
                fireEvent.click(downloadButton);
            });

            await waitFor(() => {
                expect(screen.getByText('Error: Download failed')).toBeInTheDocument();
            });
        });
    });
}); 