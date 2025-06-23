import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    Button,
    Chip,
    IconButton,
    Stack,
    Divider,
    TextField,
    CircularProgress,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Radio,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    ListSubheader,
    Toolbar,
    Alert,
    Tooltip
} from '@mui/material';
import { keyframes } from '@emotion/react';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, PlayArrow as PlayArrowIcon, CheckCircle, Cancel, HelpOutline, Assessment as AssessmentIcon, Download as DownloadIcon, AutoAwesome as AiIcon, Close as CloseIcon, PlaylistAddCheck as PlaylistAddCheckIcon, WarningAmber } from '@mui/icons-material';
import { format } from 'date-fns';
import { testCycleService } from '../services/testCycleService';
import { ValidationResult } from '../components/ValidationResult';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { needsReExecution } from '../utils/testCaseUtils';

const PURPLE = '#7c3aed';
const LIGHT_PURPLE = '#ede9fe';

const focusedInputStyle = {
    '& .MuiOutlinedInput-root': {
        '&.Mui-focused fieldset': {
            borderColor: PURPLE,
        },
    },
    '& label.Mui-focused': {
        color: PURPLE,
    },
};

const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(124, 58, 237, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(124, 58, 237, 0);
  }
`;

const StatusIndicator = ({ status }) => {
    let icon;
    let text;
    let color;

    const normalizedStatus = (status || 'not-started').toLowerCase();

    switch (normalizedStatus) {
        case 'pass':
            icon = <CheckCircle sx={{ color: '#22c55e' }} />;
            text = 'Pass';
            color = '#16a34a';
            break;
        case 'fail':
            icon = <Cancel sx={{ color: '#ef4444' }} />;
            text = 'Fail';
            color = '#dc2626';
            break;
        case 'processing':
            icon = <CircularProgress size={20} sx={{ color: '#3b82f6' }} />;
            text = 'Processing';
            color = '#2563eb';
            break;
        case 'not-started':
        default:
            icon = <HelpOutline sx={{ color: '#9ca3af' }} />;
            text = 'Not Started';
            color = '#6b7280';
            break;
    }

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon}
            <Typography variant="body2" sx={{ fontWeight: 600, color: color }}>
                {text}
            </Typography>
        </Box>
    );
};

const StepExecutionStatus = ({ stepStatus }) => {
    if (!stepStatus) {
        return null;
    }

    const { navigationStatus, validationStatus, validationResult } = stepStatus;
    const lastValidationRun = validationResult?.result?.[validationResult.result.length - 1];
    const validationError = validationResult?.error;

    return (
        <Box sx={{ mt: 2, p: 2, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc' }}>
            <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Navigation:</Typography>
                    <StatusIndicator status={navigationStatus} />
                </Box>
                {(navigationStatus?.toLowerCase() === 'pass' || navigationStatus?.toLowerCase() === 'fail') && stepStatus.assistantMessage?.content && (
                    <Paper elevation={0} sx={{ p: 2, bgcolor: '#f0f4f9', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <AiIcon sx={{ color: PURPLE }} />
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#374151' }}>
                                    Assistant's Final Message
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#4b5563', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                    {stepStatus.assistantMessage.content}
                                </Typography>
                            </Box>
                        </Stack>
                    </Paper>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Validation:</Typography>
                    <StatusIndicator status={validationStatus} />
                </Box>
            </Stack>
            {(validationStatus?.toLowerCase() === 'pass' || validationStatus?.toLowerCase() === 'fail') && lastValidationRun && (
                <Box sx={{ mt: 2 }}>
                    <ValidationResult result={lastValidationRun} onDownload={() => { }} />
                </Box>
            )}
            {validationStatus?.toLowerCase() === 'fail' && validationError && (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ color: 'red', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {validationError}
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export const TestCyclesPage = () => {
    const [testCycles, setTestCycles] = useState([]);
    const [selectedCycle, setSelectedCycle] = useState(null);
    const [selectedTestCase, setSelectedTestCase] = useState(null);
    const [testCases, setTestCases] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showCreateCycle, setShowCreateCycle] = useState(false);
    const [newCycleName, setNewCycleName] = useState('');
    const [newCycleTags, setNewCycleTags] = useState('');
    const [showCreateCase, setShowCreateCase] = useState(false);
    const [newTestCaseContent, setNewTestCaseContent] = useState('');
    const [newTestCaseTags, setNewTestCaseTags] = useState('');
    const [newTestCaseJiraIssueIds, setNewTestCaseJiraIssueIds] = useState('');
    const [newTestCaseJiraTestIds, setNewTestCaseJiraTestIds] = useState('');
    const [showEditCase, setShowEditCase] = useState(false);
    const [editCaseContent, setEditCaseContent] = useState('');
    const [editCaseTags, setEditCaseTags] = useState('');
    const [editCaseJiraIssueIds, setEditCaseJiraIssueIds] = useState('');
    const [editCaseJiraTestIds, setEditCaseJiraTestIds] = useState('');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteType, setDeleteType] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [executionDetails, setExecutionDetails] = useState({});
    const [reportStatus, setReportStatus] = useState({});
    const sseConnections = useRef({});
    const pollingIntervals = useRef({});
    const reportPollingIntervals = useRef({});

    // --- Step Management State ---
    const [steps, setSteps] = useState([]);
    const [showAddStepModal, setShowAddStepModal] = useState(false);
    const [newStepContent, setNewStepContent] = useState('');
    const [newStepTags, setNewStepTags] = useState('');
    const [editingStep, setEditingStep] = useState(null); // To hold the step being edited

    // --- Add Shared Step State ---
    const [showAddSharedStepModal, setShowAddSharedStepModal] = useState(false);
    const [sharedStepsList, setSharedStepsList] = useState([]);
    const [selectedSharedStepId, setSelectedSharedStepId] = useState('');
    const [loadingSharedSteps, setLoadingSharedSteps] = useState(false);
    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null);

    // --- Manage Shared Steps State ---
    const [editingSharedStep, setEditingSharedStep] = useState(null); // null, 'new', or step object
    const [deleteSharedStepTarget, setDeleteSharedStepTarget] = useState(null); // step object
    const [usageWarning, setUsageWarning] = useState(null); // { step, count }

    const navigate = useNavigate();

    const convertFirebaseTimestamp = (timestamp) => {
        if (!timestamp) return new Date();
        if (timestamp.seconds) {
            return new Date(timestamp.seconds * 1000);
        }
        if (timestamp._seconds) {
            return new Date(timestamp._seconds * 1000);
        }
        return new Date(timestamp);
    };

    const loadTestCycles = async (cycleToSelectId = null, testCaseToSelectId = null) => {
        setLoading(true);
        try {
            const cycles = await testCycleService.getTestCycles();
            setTestCycles(cycles);

            let cycleToSelect = cycles[0];

            if (cycleToSelectId) {
                cycleToSelect = cycles.find(c => c.id === cycleToSelectId) || cycles[0];
            }

            if (cycleToSelect) {
                await handleCycleSelect(cycleToSelect, testCaseToSelectId, false);
            } else {
                setSelectedCycle(null);
                setTestCases([]);
                setSelectedTestCase(null);
                setSteps([]);
            }
            setLoadingSharedSteps(false);
        } catch (error) {
            console.error("Failed to load test cycles", error);
            toast.error("Failed to load test cycles.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTestCycles();
        // Cleanup polling on component unmount
        return () => {
            Object.values(pollingIntervals.current).forEach(clearInterval);
            Object.values(sseConnections.current).forEach(conn => conn.close());
            Object.values(reportPollingIntervals.current).forEach(clearInterval);
        };
    }, []);


    useEffect(() => {
        const stopAll = (testCaseId) => {
            if (pollingIntervals.current[testCaseId]) {
                clearInterval(pollingIntervals.current[testCaseId]);
                delete pollingIntervals.current[testCaseId];
            }
            if (sseConnections.current[testCaseId]) {
                sseConnections.current[testCaseId].close();
                delete sseConnections.current[testCaseId];
            }
        };

        const startPollingAndSse = (testCaseId, sessionId) => {
            // Do not start if already polling
            if (pollingIntervals.current[testCaseId]) return;

            // // Start SSE
            // if (!sseConnections.current[testCaseId]) {
            //     const eventSource = new EventSource(`/api/browser-stream/${sessionId}?type=login`);
            //     sseConnections.current[testCaseId] = eventSource;

            //     eventSource.onmessage = (event) => {
            //         console.log('SSE Message:', event.data);
            //     };

            //     eventSource.onerror = (error) => {
            //         console.error('SSE Error - browser will attempt to reconnect:', error);
            //         // eventSource.close();
            //     };
            // }

            // Start Polling
            const poll = async () => {
                try {
                    const status = await testCycleService.getRunStatus(testCaseId);

                    setExecutionDetails(prev => {
                        const newDetails = { ...prev };
                        const currentDetails = newDetails[testCaseId];
                        // Merge new status but preserve session ID, then remove the trigger status
                        newDetails[testCaseId] = { ...currentDetails, ...status };
                        delete newDetails[testCaseId].status;
                        return newDetails;
                    });

                    // Stop polling if the run is complete or has failed (case-insensitive)
                    if (status.finalResult && ['pass', 'fail', 'invalidated'].includes(status.finalResult.toLowerCase())) {
                        stopAll(testCaseId);
                    }
                } catch (error) {
                    console.error(`Polling error for ${testCaseId}:`, error);
                    setExecutionDetails(prev => ({
                        ...prev,
                        [testCaseId]: { ...prev[testCaseId], finalResult: 'invalidated', error: 'Polling failed' }
                    }));
                    stopAll(testCaseId);
                }
            };

            pollingIntervals.current[testCaseId] = setInterval(poll, 5000);
            poll(); // Initial poll
        };

        Object.keys(executionDetails).forEach(testCaseId => {
            const details = executionDetails[testCaseId];
            const finalResultStatus = details?.finalResult?.toLowerCase();
            const isRunning = finalResultStatus === 'running' || finalResultStatus === 'processing';

            if ((details?.status === 'executing_navigation' || isRunning) && details.sessionId) {
                startPollingAndSse(testCaseId, details.sessionId);
            }
        });

    }, [executionDetails]);

    const pollReport = async (testCaseId) => {
        try {
            const status = await testCycleService.getReportStatus(testCaseId);
            setReportStatus(prev => ({ ...prev, [testCaseId]: status }));

            if (status.status === 'completed' || status.status === 'failed' || status.status === 'not_started') {
                clearInterval(reportPollingIntervals.current[testCaseId]);
                delete reportPollingIntervals.current[testCaseId];
            }
        } catch (error) {
            console.error(`Report polling error for ${testCaseId}:`, error);
            setReportStatus(prev => ({
                ...prev,
                [testCaseId]: { status: 'failed', error: 'Polling failed' }
            }));
            clearInterval(reportPollingIntervals.current[testCaseId]);
            delete reportPollingIntervals.current[testCaseId];
        }
    };

    const startReportPolling = (testCaseId) => {
        if (reportPollingIntervals.current[testCaseId]) {
            return; // Polling is already active
        }
        reportPollingIntervals.current[testCaseId] = setInterval(() => pollReport(testCaseId), 5000);
        pollReport(testCaseId); // Initial poll
    };

    const handleCycleSelect = async (cycle, testCaseToSelectId = null, doSetLoading = true) => {
        if (doSetLoading) setLoading(true);
        setSelectedCycle(cycle);
        const fresh = await testCycleService.getTestCycle(cycle.id);
        const cases = fresh.testCases || [];
        setTestCases(cases);

        if (cases.length > 0) {
            const statusPromises = cases.map(tc =>
                testCycleService.getRunStatus(tc.id)
                    .then(status => ({ id: tc.id, status }))
                    .catch(() => ({ id: tc.id, status: { finalResult: 'invalidated', error: 'Failed to fetch status' } }))
            );

            const allStatuses = await Promise.all(statusPromises);
            const newExecutionDetails = allStatuses.reduce((acc, item) => {
                acc[item.id] = item.status;
                return acc;
            }, {});

            setExecutionDetails(prev => ({ ...prev, ...newExecutionDetails }));

            const reportStatusPromises = cases.map(tc =>
                testCycleService.getReportStatus(tc.id).catch(() => null)
            );
            const allReportStatuses = await Promise.all(reportStatusPromises);
            const newReportStatuses = {};
            allReportStatuses.forEach((status, index) => {
                if (status) {
                    const testCaseId = cases[index].id;
                    newReportStatuses[testCaseId] = status;
                    // If a report is already in an active state on page load, resume polling.
                    if (status.status && !['completed', 'failed', 'not_started'].includes(status.status)) {
                        startReportPolling(testCaseId);
                    }
                }
            });
            setReportStatus(prev => ({ ...prev, ...newReportStatuses }));

            let testCaseToSelect = cases[0];
            if (testCaseToSelectId) {
                testCaseToSelect = cases.find(tc => tc.id === testCaseToSelectId) || cases[0];
            }

            if (testCaseToSelect) {
                handleTestCaseSelect(testCaseToSelect, cases);
            } else {
                setSelectedTestCase(null);
                setSteps([]);
            }
        } else {
            setSelectedTestCase(null);
            setSteps([]);
        }
        if (doSetLoading) setLoading(false);
    };

    const handleTestCaseSelect = (testCase, currentTestCases = testCases) => {
        const fullTestCase = currentTestCases.find(tc => tc.id === testCase.id);
        setSelectedTestCase(fullTestCase);
        setSteps(fullTestCase?.steps || []);
    };

    const handleExecuteClick = async (testCase) => {
        setExecutionDetails(prev => ({
            ...prev,
            [testCase.id]: { status: 'executing_navigation', sessionId: null, artifactUrl: null, error: null }
        }));

        try {
            const data = await testCycleService.executeTestCase(testCase);
            if (data.success) {
                setExecutionDetails(prev => ({
                    ...prev,
                    [testCase.id]: { ...prev[testCase.id], status: 'executing_navigation', sessionId: data.sessionId }
                }));
                await loadTestCycles(selectedCycle.id, selectedTestCase.id);
            } else {
                setExecutionDetails(prev => ({
                    ...prev,
                    [testCase.id]: { ...prev[testCase.id], status: 'error', error: data.error }
                }));
            }
        } catch (error) {
            setExecutionDetails(prev => ({
                ...prev,
                [testCase.id]: { ...prev[testCase.id], status: 'error', error: 'An unknown error occurred' }
            }));
        }
    };

    const handleCreateCycle = async () => {
        await testCycleService.createTestCycle(newCycleName, newCycleTags.split(',').map(t => t.trim()).filter(Boolean));
        setShowCreateCycle(false);
        setNewCycleName('');
        setNewCycleTags('');
        await loadTestCycles();
    };

    const handleCreateTestCase = async () => {
        await testCycleService.addTestCase(
            selectedCycle.id,
            newTestCaseContent,
            newTestCaseTags.split(',').map(t => t.trim()).filter(Boolean),
            newTestCaseJiraIssueIds.split(',').map(id => id.trim()).filter(Boolean),
            newTestCaseJiraTestIds.split(',').map(id => id.trim()).filter(Boolean)
        );
        setShowCreateCase(false);
        setNewTestCaseContent('');
        setNewTestCaseTags('');
        setNewTestCaseJiraIssueIds('');
        setNewTestCaseJiraTestIds('');
        await loadTestCycles(selectedCycle.id);
    };

    const handleEditClick = () => {
        if (!selectedTestCase) return;
        setEditCaseContent(selectedTestCase.description);
        setEditCaseTags(selectedTestCase.tags?.join(', ') || '');
        setEditCaseJiraIssueIds(selectedTestCase.jiraIssueIds?.join(', ') || '');
        setEditCaseJiraTestIds(selectedTestCase.jiraTestIds?.join(', ') || '');
        setShowEditCase(true);
    };

    const handleEditTestCase = async () => {
        if (!selectedTestCase) return;
        await testCycleService.updateTestCase(selectedCycle.id, selectedTestCase.id, {
            description: editCaseContent,
            tags: editCaseTags.split(',').map(t => t.trim()).filter(Boolean),
            jiraIssueIds: editCaseJiraIssueIds.split(',').map(id => id.trim()).filter(Boolean),
            jiraTestIds: editCaseJiraTestIds.split(',').map(id => id.trim()).filter(Boolean),
        });
        setShowEditCase(false);
        await loadTestCycles(selectedCycle.id, selectedTestCase.id);
    };

    const handleDeleteCycleClick = (cycle) => {
        setDeleteType('cycle');
        setDeleteTarget(cycle);
        setDeleteDialogOpen(true);
    };

    const handleDeleteCaseClick = (testCase) => {
        setDeleteType('case');
        setDeleteTarget(testCase);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        let cycleIdToPreserve = selectedCycle?.id;
        if (deleteType === 'cycle' && deleteTarget.id === selectedCycle?.id) {
            cycleIdToPreserve = null;
        }

        if (deleteType === 'cycle' && deleteTarget) {
            await testCycleService.deleteTestCycle(deleteTarget.id);
        } else if (deleteType === 'case' && deleteTarget) {
            await testCycleService.deleteTestCase(selectedCycle.id, deleteTarget.id);
        }
        setDeleteDialogOpen(false);
        setDeleteType(null);
        setDeleteTarget(null);
        await loadTestCycles(cycleIdToPreserve);
    };

    const handleCancelDelete = () => {
        setDeleteDialogOpen(false);
        setDeleteType(null);
        setDeleteTarget(null);
    };

    // --- Step Management Handlers ---
    const handleAddStep = async () => {
        if (!newStepContent.trim()) {
            toast.warn("Step content cannot be empty.");
            return;
        }
        try {
            await testCycleService.addStep(selectedCycle.id, selectedTestCase.id, {
                content: newStepContent,
                tags: newStepTags.split(',').map(tag => tag.trim()).filter(Boolean)
            });
            await loadTestCycles(selectedCycle.id, selectedTestCase.id);

            toast.success("Step added successfully!");
            setNewStepContent('');
            setNewStepTags('');
            setShowAddStepModal(false);
        } catch (error) {
            toast.error(`Failed to add step: ${error.message}`);
        }
    };

    const handleUpdateStep = async (stepId) => {
        if (!editingStep || !editingStep.content.trim()) {
            toast.warn("Step content cannot be empty.");
            return;
        }
        try {
            await testCycleService.updateStep(selectedCycle.id, selectedTestCase.id, stepId, {
                content: editingStep.content,
                tags: editingStep.tags
            });
            await loadTestCycles(selectedCycle.id, selectedTestCase.id);

            toast.success("Step updated successfully!");
            setEditingStep(null);
        } catch (error) {
            toast.error(`Failed to update step: ${error.message}`);
        }
    };

    const handleDeleteStep = async (stepId) => {
        try {
            await testCycleService.deleteStep(selectedCycle.id, selectedTestCase.id, stepId);
            const updatedSteps = steps.filter(s => s.id !== stepId);
            setSteps(updatedSteps);
            const updatedTestCases = testCases.map(tc => tc.id === selectedTestCase.id ? { ...tc, steps: updatedSteps } : tc);
            setTestCases(updatedTestCases);
            toast.success("Step deleted successfully!");
        } catch (error) {
            toast.error(`Failed to delete step: ${error.message}`);
        }
    };

    const startEditingStep = (step) => {
        setEditingStep({ ...step }); // Create a copy for editing
    };

    const isAnyTestExecuting = Object.values(executionDetails).some(
        details => details?.status === 'executing_navigation' || ['running', 'processing'].includes(details?.finalResult?.toLowerCase())
    );

    const handleGenerateReportClick = async (testCaseId) => {
        setReportStatus(prev => ({
            ...prev,
            [testCaseId]: { status: 'generating' }
        }));
        try {
            await testCycleService.generateReport(testCaseId);
            // poll after 5 seconds
            setTimeout(() => {
                startReportPolling(testCaseId);
            }, 5000);
        } catch (error) {
            toast.error("Failed to start report generation.");
            setReportStatus(prev => ({
                ...prev,
                [testCaseId]: { status: 'failed', error: 'Failed to start generation' }
            }));
        }
    };

    const handleDownloadReportClick = async (testCaseId) => {
        const url = reportStatus[testCaseId]?.downloadUrl;
        if (!url) {
            toast.error("No download URL available.");
            return;
        }
        try {
            toast.info("Your download will begin shortly.");
            await testCycleService.downloadReport(url, testCaseId);
        } catch (error) {
            toast.error("Failed to download the report.");
            console.error("Download error:", error);
        }
    };

    // --- Add Shared Step Handlers ---
    const handleOpenAddSharedStepModal = async () => {
        setLoadingSharedSteps(true);
        setShowAddSharedStepModal(true);
        try {
            const [groups, ungroupedSteps] = await Promise.all([
                testCycleService.getGroups('step'),
                testCycleService.getSharedSteps()
            ]);
            setGroups(groups);
            setSharedStepsList(ungroupedSteps);
        } catch (error) {
            toast.error("Failed to load shared steps or groups.");
            console.error("Failed to load data for import modal", error);
        } finally {
            setLoadingSharedSteps(false);
        }
    };

    const handleGroupSelect = async (groupId) => {
        setLoadingSharedSteps(true);
        setSelectedGroupId(groupId);
        setSelectedSharedStepId('');
        try {
            if (groupId) {
                const steps = await testCycleService.getSharedStepsByGroup(groupId);
                setSharedStepsList(steps);
            } else {
                // This is for the "Ungrouped" section
                const ungroupedSteps = await testCycleService.getSharedSteps();
                setSharedStepsList(ungroupedSteps);
            }
        } catch (error) {
            toast.error("Failed to load steps for this group.");
            console.error(`Failed to load steps for group ${groupId}`, error);
            setSharedStepsList([]);
        } finally {
            setLoadingSharedSteps(false);
        }
    };

    const handleLinkSharedStep = async () => {
        if (!selectedSharedStepId) {
            toast.warn("Please select a shared step to add.");
            return;
        }
        try {
            await testCycleService.importSharedStep(selectedCycle.id, selectedTestCase.id, selectedSharedStepId);
            await loadTestCycles(selectedCycle.id, selectedTestCase.id);
            toast.success("Shared step linked successfully!");
            setShowAddSharedStepModal(false);
            setSelectedSharedStepId('');
        } catch (error) {
            toast.error(`Failed to link shared step: ${error.message}`);
        }
    };

    const handleEditSharedStepClick = async (step) => {
        try {
            const { usageCount } = await testCycleService.getSharedStepUsage(step.id);
            if (usageCount > 0) {
                setUsageWarning({ step, count: usageCount });
            } else {
                setEditingSharedStep({ ...step });
            }
        } catch (error) {
            toast.error("Could not check step usage. Please try again.");
            console.error("Error checking step usage:", error);
        }
    };

    const handleProceedWithEdit = () => {
        if (usageWarning) {
            setEditingSharedStep({ ...usageWarning.step });
            setUsageWarning(null);
        }
    };

    const handleSaveSharedStep = async () => {
        if (!editingSharedStep?.name?.trim()) {
            toast.warn("Step name cannot be empty.");
            return;
        }
        if (!editingSharedStep?.content?.trim()) {
            toast.warn("Step content cannot be empty.");
            return;
        }

        try {
            if (editingSharedStep.id) { // Editing existing step
                await testCycleService.updateSharedStep(editingSharedStep.id, {
                    name: editingSharedStep.name,
                    content: editingSharedStep.content,
                    tags: editingSharedStep.tags,
                    groupId: editingSharedStep.groupId === '' ? null : editingSharedStep.groupId
                });
                toast.success("Shared step updated successfully!");
            } else { // Creating new step
                await testCycleService.createSharedStep({
                    name: editingSharedStep.name,
                    content: editingSharedStep.content,
                    tags: editingSharedStep.tags,
                    groupId: editingSharedStep.groupId
                });
                toast.success("Shared step created successfully!");
            }
            setEditingSharedStep(null);
            // Refresh the list
            const steps = await testCycleService.getSharedSteps();
            setSharedStepsList(steps);

        } catch (error) {
            toast.error(`Failed to save shared step: ${error.message}`);
        }
    };

    const handleConfirmDeleteSharedStep = async () => {
        if (!deleteSharedStepTarget) return;
        try {
            await testCycleService.deleteSharedStep(deleteSharedStepTarget.id);
            toast.success("Shared step deleted successfully!");
            setDeleteSharedStepTarget(null);
            // Refresh the list
            const steps = await testCycleService.getSharedSteps();
            setSharedStepsList(steps);
        } catch (error) {
            toast.error(error.message || "Failed to delete shared step.");
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, bgcolor: LIGHT_PURPLE, overflow: 'hidden' }}>
            <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1.5, borderBottom: '1px solid #e0e0e0', bgcolor: 'white' }}>
                <Button
                    variant="outlined"
                    startIcon={<PlaylistAddCheckIcon />}
                    onClick={() => navigate('/shared-steps')}
                    disabled={isAnyTestExecuting}
                    sx={{ color: PURPLE, borderColor: PURPLE, '&:hover': { borderColor: PURPLE, bgcolor: 'rgba(124, 58, 237, 0.04)' } }}
                >
                    Manage Shared Steps
                </Button>
            </Box>
            {/* Main 3-column layout */}
            <Box sx={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, gap: 2, px: 2, py: 2 }}>
                {/* Left: Test Cycles List */}
                <Paper elevation={2} sx={{ width: 280, p: 0, overflowY: 'auto', borderRadius: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, pb: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>Test Groups</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            size="small"
                            sx={{ bgcolor: PURPLE, color: 'white', fontWeight: 600, borderRadius: 2, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9' } }}
                            onClick={() => setShowCreateCycle(true)}
                            disabled={isAnyTestExecuting}
                        >
                            New
                        </Button>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
                        {testCycles.map((cycle, index) => (
                            <Paper
                                key={cycle.id}
                                onClick={() => !isAnyTestExecuting && handleCycleSelect(cycle)}
                                elevation={selectedCycle?.id === cycle.id ? 4 : 1}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    cursor: isAnyTestExecuting ? 'not-allowed' : 'pointer',
                                    opacity: isAnyTestExecuting && selectedCycle?.id !== cycle.id ? 0.6 : 1,
                                    border: `1px solid ${selectedCycle?.id === cycle.id ? PURPLE : '#e0e0e0'}`,
                                    bgcolor: selectedCycle?.id === cycle.id ? LIGHT_PURPLE : 'white',
                                    transition: 'all 0.2s ease-in-out',
                                    '&:hover': {
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        borderColor: PURPLE,
                                        transform: 'translateY(-2px)'
                                    }
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                            <Typography sx={{ fontWeight: 700, color: PURPLE, mr: 1 }}>{index + 1}.</Typography>
                                            <Typography sx={{ fontWeight: 600, color: '#374151' }}>{cycle.name}</Typography>
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                            {cycle.testCases?.length || 0} test cases
                                        </Typography>
                                    </Box>
                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteCycleClick(cycle); }} disabled={isAnyTestExecuting}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                                <Box>
                                    {cycle.tags?.map(tag => (
                                        <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5, bgcolor: '#e5e7eb' }} />
                                    ))}
                                </Box>
                            </Paper>
                        ))}
                    </Box>
                </Paper>
                {/* Middle: Test Cases List */}
                <Paper elevation={2} sx={{ width: 340, borderRadius: 3, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ p: 2, pb: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
                                {selectedCycle ? selectedCycle.name : 'Select a group'}
                            </Typography>
                            {loading && <CircularProgress size={24} sx={{ ml: 1 }} />}
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                size="small"
                                sx={{ bgcolor: PURPLE, color: 'white', fontWeight: 600, '&:hover': { bgcolor: '#6d28d9' } }}
                                disabled={!selectedCycle || isAnyTestExecuting}
                                onClick={() => setShowCreateCase(true)}
                            >
                                Add Test Case
                            </Button>
                        </Box>
                        <Divider />
                    </Box>
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {testCases.map((tc, index) => {
                            const details = executionDetails[tc.id];
                            const finalResult = details?.finalResult?.toLowerCase();
                            const isExecuting = finalResult === 'running' || finalResult === 'processing' || details?.status === 'executing_navigation';

                            let finalStatusStyle = {};
                            let finalStatusIcon = null;

                            if (finalResult) {
                                switch (finalResult.toLowerCase()) {
                                    case 'pass':
                                        finalStatusStyle = { borderColor: '#22c55e', borderWidth: '2px' };
                                        finalStatusIcon = <CheckCircle sx={{ color: '#22c55e', mr: 1 }} />;
                                        break;
                                    case 'fail':
                                        finalStatusStyle = { borderColor: '#ef4444', borderWidth: '2px' };
                                        finalStatusIcon = <Cancel sx={{ color: '#ef4444', mr: 1 }} />;
                                        break;
                                    case 'invalidated':
                                        finalStatusStyle = { borderColor: '#9ca3af', borderWidth: '2px' };
                                        finalStatusIcon = <HelpOutline sx={{ color: '#9ca3af', mr: 1 }} />;
                                        break;
                                    default:
                                        break;
                                }
                            }

                            return (
                                <Paper
                                    key={tc.id}
                                    onClick={() => !isAnyTestExecuting && handleTestCaseSelect(tc)}
                                    elevation={selectedTestCase?.id === tc.id ? 4 : 1}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 2,
                                        cursor: isAnyTestExecuting ? 'not-allowed' : 'pointer',
                                        opacity: isAnyTestExecuting && selectedTestCase?.id !== tc.id ? 0.6 : 1,
                                        border: `1px solid ${selectedTestCase?.id === tc.id ? PURPLE : '#e0e0e0'}`,
                                        bgcolor: selectedTestCase?.id === tc.id ? LIGHT_PURPLE : 'white',
                                        transition: 'all 0.2s ease-in-out',
                                        animation: isExecuting ? `${pulse} 2s infinite` : 'none',
                                        ...finalStatusStyle,
                                        '&:hover': {
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            borderColor: PURPLE,
                                            transform: 'translateY(-2px)'
                                        }
                                    }}
                                    title={tc.description}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                                        {finalStatusIcon}
                                        <Typography sx={{ fontWeight: 500, color: 'text.secondary', mr: 1 }}>{index + 1}.</Typography>
                                        <Typography
                                            sx={{
                                                fontWeight: 500,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                        >
                                            {tc.description}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ mt: 1.5, pl: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Created: {format(convertFirebaseTimestamp(tc.createdAt), 'MMM d, yyyy')}
                                        </Typography>
                                        {needsReExecution(tc) && (
                                            <Tooltip title="Some steps have been added or modified. Please re-execute.">
                                                <WarningAmber sx={{ color: 'warning.main' }} />
                                            </Tooltip>
                                        )}
                                    </Box>
                                </Paper>
                            );
                        })}
                    </Box>
                </Paper>
                {/* Right: Test Case Details */}
                <Paper elevation={2} sx={{ flex: 1, p: 3, borderRadius: 3, minWidth: 0, overflowY: 'auto' }}>
                    {selectedTestCase ? (
                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                    Test Case Details
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                    <IconButton
                                        onClick={() => handleExecuteClick(selectedTestCase)}
                                        aria-label="execute test case"
                                        disabled={['running', 'processing'].includes(executionDetails[selectedTestCase.id]?.finalResult?.toLowerCase()) || executionDetails[selectedTestCase.id]?.status === 'executing_navigation'}
                                    >
                                        {(['running', 'processing'].includes(executionDetails[selectedTestCase.id]?.finalResult?.toLowerCase()) || executionDetails[selectedTestCase.id]?.status === 'executing_navigation') ? <CircularProgress size={24} color="inherit" /> : <PlayArrowIcon sx={{ color: '#16a34a' }} />}
                                    </IconButton>

                                    {(() => {
                                        const isReportLoading = (status) => ['generating', 'processing'].includes(status);
                                        const status = reportStatus[selectedTestCase.id]?.status;

                                        if (isReportLoading(status)) {
                                            return (
                                                <IconButton disabled>
                                                    <CircularProgress size={24} />
                                                </IconButton>
                                            );
                                        }
                                        if (status === 'completed') {
                                            return (
                                                <IconButton
                                                    onClick={() => handleDownloadReportClick(selectedTestCase.id)}
                                                    aria-label="download report"
                                                >
                                                    <DownloadIcon sx={{ color: PURPLE }} />
                                                </IconButton>
                                            );
                                        }
                                        return (
                                            <IconButton
                                                onClick={() => handleGenerateReportClick(selectedTestCase.id)}
                                                aria-label="generate report"
                                                disabled={isAnyTestExecuting}
                                            >
                                                <AssessmentIcon sx={{ color: PURPLE }} />
                                            </IconButton>
                                        );
                                    })()}

                                    <IconButton onClick={handleEditClick} aria-label="edit test case" disabled={isAnyTestExecuting}>
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton onClick={() => handleDeleteCaseClick(selectedTestCase)} aria-label="delete test case" disabled={isAnyTestExecuting}>
                                        <DeleteIcon />
                                    </IconButton>
                                </Stack>
                            </Box>
                            <Divider sx={{ mb: 2 }} />

                            {/* Description Section */}
                            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', color: '#374151' }}>
                                Description
                            </Typography>
                            <Box sx={{ mb: 2, p: 2, border: '1px solid #eee', borderRadius: 2, background: '#f8fafc', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {selectedTestCase.description}
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                                Created: {format(convertFirebaseTimestamp(selectedTestCase.createdAt), 'MMM d, yyyy')}
                                {selectedTestCase.executedAt && (
                                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                                        Last Executed: {format(convertFirebaseTimestamp(selectedTestCase.executedAt), 'MMM d, yyyy p')}
                                    </Typography>
                                )}
                            </Typography>
                            {needsReExecution({ ...selectedTestCase, steps }) && (
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    Some steps have been added or modified. Please re-execute, as the previous run may not be valid.
                                </Alert>
                            )}
                            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                                {selectedTestCase.tags?.map(tag => (
                                    <Chip key={tag} label={tag} size="small" />
                                ))}
                            </Stack>

                            {selectedTestCase.jiraIssueIds?.length > 0 && (
                                <Box sx={{ mb: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#4b5563', display: 'block', mb: 0.5 }}>Jira Issues:</Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                        {selectedTestCase.jiraIssueIds.map(id => <Chip key={id} label={id} size="small" variant="outlined" />)}
                                    </Stack>
                                </Box>
                            )}
                            {selectedTestCase.jiraTestIds?.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#4b5563', display: 'block', mb: 0.5 }}>Jira Tests:</Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                        {selectedTestCase.jiraTestIds.map(id => <Chip key={id} label={id} size="small" variant="outlined" />)}
                                    </Stack>
                                </Box>
                            )}

                            <Divider sx={{ my: 3 }} />

                            {/* Steps Section */}
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>Steps</Typography>
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            variant="outlined"
                                            startIcon={<AddIcon />}
                                            onClick={() => setShowAddStepModal(true)}
                                            sx={{ color: PURPLE, borderColor: PURPLE, '&:hover': { borderColor: PURPLE, bgcolor: 'rgba(124, 58, 237, 0.04)' } }}
                                            disabled={isAnyTestExecuting}
                                        >
                                            Add New Step
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            startIcon={<AddIcon />}
                                            onClick={handleOpenAddSharedStepModal}
                                            sx={{ color: PURPLE, borderColor: PURPLE, '&:hover': { borderColor: PURPLE, bgcolor: 'rgba(124, 58, 237, 0.04)' } }}
                                            disabled={isAnyTestExecuting}
                                        >
                                            Import Shared Step
                                        </Button>
                                    </Stack>
                                </Box>
                                <Stack spacing={2}>
                                    {steps.map((step) => {
                                        const details = executionDetails[selectedTestCase?.id];
                                        const stepStatus = details?.steps?.[step.id];

                                        let stepStyle = { p: 2, borderRadius: 2, border: '1px solid #e2e8f0', transition: 'border-color 0.3s ease' };

                                        const finalResultStatus = details?.finalResult?.toLowerCase();
                                        const isTestCaseRunning = finalResultStatus === 'running' || finalResultStatus === 'processing' || details?.status === 'executing_navigation';

                                        if (stepStatus) {
                                            const isStepProcessing = stepStatus.navigationStatus === 'processing' || stepStatus.validationStatus === 'processing';
                                            if (isStepProcessing) {
                                                stepStyle.animation = `${pulse} 2s infinite`;
                                            }

                                            if (stepStatus.navigationStatus?.toLowerCase() === 'fail' || stepStatus.validationStatus?.toLowerCase() === 'fail') {
                                                stepStyle.border = '1px solid #ef4444';
                                            } else if (stepStatus.validationStatus?.toLowerCase() === 'pass') {
                                                stepStyle.border = '1px solid #22c55e';
                                            }
                                        } else if (isTestCaseRunning) {
                                            stepStyle.animation = `${pulse} 2s infinite`;
                                        }


                                        return (
                                            <Paper key={step.id} elevation={2} sx={stepStyle}>
                                                {editingStep?.id === step.id ? (
                                                    <Stack spacing={1.5}>
                                                        <TextField
                                                            multiline
                                                            rows={4}
                                                            fullWidth
                                                            label="Step Description"
                                                            value={editingStep.content}
                                                            onChange={(e) => setEditingStep({ ...editingStep, content: e.target.value })}
                                                            sx={focusedInputStyle}
                                                        />
                                                        <TextField
                                                            fullWidth
                                                            label="Tags (comma-separated)"
                                                            value={editingStep.tags.join(', ')}
                                                            onChange={(e) => setEditingStep({ ...editingStep, tags: e.target.value.split(',').map(t => t.trim()) })}
                                                            sx={focusedInputStyle}
                                                        />
                                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                            <Button onClick={() => setEditingStep(null)}>Cancel</Button>
                                                            <Button variant="contained" onClick={() => handleUpdateStep(step.id)} sx={{ bgcolor: PURPLE }}>Save</Button>
                                                        </Stack>
                                                    </Stack>
                                                ) : (
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <Box sx={{ flex: 1 }}>
                                                            <Box sx={{ mb: 1.5 }}>
                                                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                                                    Prompt:
                                                                </Typography>
                                                                <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: '0.9rem' }}>
                                                                    {step.content}
                                                                </Box>
                                                            </Box>
                                                            <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
                                                                <Chip
                                                                    label={step.type === 'shared' ? 'Shared' : 'Not Shared'}
                                                                    size="small"
                                                                    color={step.type === 'shared' ? 'secondary' : 'default'}
                                                                    variant="outlined"
                                                                />
                                                                {step.tags.map(tag => <Chip key={tag} label={tag} size="small" />)}
                                                            </Stack>
                                                            {isTestCaseRunning || stepStatus ? <StepExecutionStatus stepStatus={stepStatus} /> : null}
                                                        </Box>
                                                        <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
                                                            <IconButton size="small" onClick={() => startEditingStep(step)} disabled={isAnyTestExecuting || step.type === 'shared'}><EditIcon fontSize="small" /></IconButton>
                                                            <IconButton size="small" onClick={() => handleDeleteStep(step.id)} disabled={isAnyTestExecuting}><DeleteIcon fontSize="small" /></IconButton>
                                                        </Stack>
                                                    </Box>
                                                )}
                                            </Paper>
                                        );
                                    })}
                                </Stack>

                            </Box>

                        </Box>
                    ) : (
                        <Typography variant="body1" color="text.secondary">Select a test case to see details.</Typography>
                    )}
                </Paper>
            </Box>
            {/* Create Cycle Dialog */}
            {showCreateCycle && (
                <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', bgcolor: 'rgba(0,0,0,0.2)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Paper sx={{ p: 4, minWidth: 320, borderRadius: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Create New Test Cycle</Typography>
                        <TextField
                            label="Test Cycle Name"
                            fullWidth
                            variant="outlined"
                            value={newCycleName}
                            onChange={e => setNewCycleName(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            label="Tags (comma separated)"
                            fullWidth
                            variant="outlined"
                            value={newCycleTags}
                            onChange={e => setNewCycleTags(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button onClick={() => setShowCreateCycle(false)}>Cancel</Button>
                            <Button variant="contained" sx={{ bgcolor: PURPLE }} onClick={handleCreateCycle} disabled={!newCycleName.trim() || isAnyTestExecuting}>Create</Button>
                        </Box>
                    </Paper>
                </Box>
            )}
            {/* Add Step Modal */}
            {showAddStepModal && (
                <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', bgcolor: 'rgba(0,0,0,0.2)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Paper sx={{ p: 4, minWidth: 480, borderRadius: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Add New Step</Typography>
                        <TextField
                            multiline
                            rows={4}
                            fullWidth
                            label="Step Description"
                            value={newStepContent}
                            onChange={(e) => setNewStepContent(e.target.value)}
                            placeholder="Enter details for the new step..."
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            fullWidth
                            label="Tags (comma-separated)"
                            value={newStepTags}
                            onChange={(e) => setNewStepTags(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button onClick={() => setShowAddStepModal(false)}>Cancel</Button>
                            <Button variant="contained" sx={{ bgcolor: PURPLE }} onClick={handleAddStep} disabled={!newStepContent.trim() || isAnyTestExecuting}>Add Step</Button>
                        </Box>
                    </Paper>
                </Box>
            )}
            {/* Create Test Case Dialog */}
            {showCreateCase && (
                <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', bgcolor: 'rgba(0,0,0,0.2)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Paper sx={{ p: 4, minWidth: 480, borderRadius: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Add Test Case</Typography>
                        <TextField
                            label="Test Case Description"
                            fullWidth
                            variant="outlined"
                            value={newTestCaseContent}
                            onChange={e => setNewTestCaseContent(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            placeholder="Enter test case description..."
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            label="Tags (comma separated)"
                            fullWidth
                            variant="outlined"
                            value={newTestCaseTags}
                            onChange={e => setNewTestCaseTags(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            label="Jira Issue IDs (comma separated)"
                            fullWidth
                            variant="outlined"
                            value={newTestCaseJiraIssueIds}
                            onChange={e => setNewTestCaseJiraIssueIds(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            label="Jira Test IDs (comma separated)"
                            fullWidth
                            variant="outlined"
                            value={newTestCaseJiraTestIds}
                            onChange={e => setNewTestCaseJiraTestIds(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button onClick={() => setShowCreateCase(false)}>Cancel</Button>
                            <Button variant="contained" sx={{ bgcolor: PURPLE }} onClick={handleCreateTestCase} disabled={!newTestCaseContent.trim() || isAnyTestExecuting}>Add</Button>
                        </Box>
                    </Paper>
                </Box>
            )}
            {/* Edit Test Case Dialog */}
            {showEditCase && (
                <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', bgcolor: 'rgba(0,0,0,0.2)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Paper sx={{ p: 4, minWidth: 480, borderRadius: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Edit Test Case</Typography>
                        <TextField
                            label="Test Case Description"
                            fullWidth
                            variant="outlined"
                            value={editCaseContent}
                            onChange={e => setEditCaseContent(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            label="Tags (comma separated)"
                            fullWidth
                            variant="outlined"
                            value={editCaseTags}
                            onChange={e => setEditCaseTags(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            label="Jira Issue IDs (comma separated)"
                            fullWidth
                            variant="outlined"
                            value={editCaseJiraIssueIds}
                            onChange={e => setEditCaseJiraIssueIds(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <TextField
                            label="Jira Test IDs (comma separated)"
                            fullWidth
                            variant="outlined"
                            value={editCaseJiraTestIds}
                            onChange={e => setEditCaseJiraTestIds(e.target.value)}
                            sx={{ mb: 2, ...focusedInputStyle }}
                            disabled={isAnyTestExecuting}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button onClick={() => setShowEditCase(false)}>Cancel</Button>
                            <Button variant="contained" sx={{ bgcolor: PURPLE }} onClick={handleEditTestCase} disabled={!editCaseContent.trim() || isAnyTestExecuting}>Save</Button>
                        </Box>
                    </Paper>
                </Box>
            )}
            <Dialog open={deleteDialogOpen} onClose={handleCancelDelete}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {deleteType === 'cycle' && deleteTarget && (
                            <>Are you sure you want to delete the test cycle <b>{deleteTarget.name}</b> and all its test cases?</>
                        )}
                        {deleteType === 'case' && deleteTarget && (
                            <>Are you sure you want to delete the test case <b>{deleteTarget.description?.slice(0, 40) || 'this test case'}</b>?</>
                        )}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancelDelete}>Cancel</Button>
                    <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={isAnyTestExecuting}>Delete</Button>
                </DialogActions>
            </Dialog>
            {/* Add Shared Step Modal */}
            {showAddSharedStepModal && (
                <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', bgcolor: 'rgba(0,0,0,0.2)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Paper sx={{ p: 4, width: 800, height: '80vh', borderRadius: 3, display: 'flex', flexDirection: 'row' }}>
                        {/* Left side for groups */}
                        <Box sx={{ width: '30%', borderRight: '1px solid #e0e0e0', overflowY: 'auto', pr: 2 }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>Groups</Typography>
                            <List component="nav">
                                <ListItemButton selected={selectedGroupId === null} onClick={() => handleGroupSelect(null)}>
                                    <ListItemText primary="Ungrouped" />
                                </ListItemButton>
                                {groups.map((group) => (
                                    <ListItemButton key={group.id} selected={selectedGroupId === group.id} onClick={() => handleGroupSelect(group.id)}>
                                        <ListItemText primary={group.name} />
                                    </ListItemButton>
                                ))}
                            </List>
                        </Box>

                        {/* Right side for steps */}
                        <Box sx={{ width: '70%', pl: 2, display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>
                                {selectedGroupId ? groups.find(g => g.id === selectedGroupId)?.name : 'Ungrouped'} Steps
                            </Typography>
                            <Box sx={{ flex: 1, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 2 }}>
                                {loadingSharedSteps ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                        <CircularProgress />
                                    </Box>
                                ) : (
                                    <List>
                                        {sharedStepsList.length > 0 ? sharedStepsList.map((step) => (
                                            <ListItemButton
                                                key={step.id}
                                                selected={selectedSharedStepId === step.id}
                                                onClick={() => setSelectedSharedStepId(step.id)}
                                                sx={{ m: 1, borderRadius: 2, border: '1px solid #eee' }}
                                            >
                                                <ListItemText primary={step.name} secondary={step.content} />
                                            </ListItemButton>
                                        )) : <ListItem><ListItemText primary="No steps in this group." /></ListItem>}
                                    </List>
                                )}
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2, pt: 2, borderTop: '1px solid #e0e0e0' }}>
                                <Button onClick={() => { setShowAddSharedStepModal(false); setSelectedSharedStepId(''); setSelectedGroupId(null); }}>Cancel</Button>
                                <Button variant="contained" sx={{ bgcolor: PURPLE }} onClick={handleLinkSharedStep} disabled={!selectedSharedStepId || loadingSharedSteps}>Import Step</Button>
                            </Box>
                        </Box>
                    </Paper>
                </Box>
            )}
            {/* Edit Usage Warning Dialog */}
            <Dialog open={!!usageWarning} onClose={() => setUsageWarning(null)}>
                <DialogTitle>Edit Shared Step</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This shared step is used in <b>{usageWarning?.count} test case(s)</b>.
                        Editing it will affect all of them. Are you sure you want to proceed?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setUsageWarning(null)}>Cancel</Button>
                    <Button onClick={handleProceedWithEdit} color="warning" variant="contained">Proceed</Button>
                </DialogActions>
            </Dialog>

            {/* Confirm Delete Shared Step Dialog */}
            <Dialog open={!!deleteSharedStepTarget} onClose={() => setDeleteSharedStepTarget(null)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this shared step? This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteSharedStepTarget(null)}>Cancel</Button>
                    <Button onClick={handleConfirmDeleteSharedStep} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}; 