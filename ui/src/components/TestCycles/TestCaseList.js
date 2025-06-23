import React, { useState, useEffect } from 'react';
import { testCycleService } from '../../services/testCycleService';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    TextField,
    Typography,
    useTheme
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { needsReExecution } from '../../utils/testCaseUtils';

// Helper function to convert Firebase Timestamp to Date
const convertFirebaseTimestamp = (timestamp) => {
    if (!timestamp) return new Date();
    if (timestamp._seconds) {
        return new Date(timestamp._seconds * 1000);
    }
    return new Date(timestamp);
};

export const TestCaseList = ({ cycleId }) => {
    const [testCases, setTestCases] = useState([]);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedTestCase, setSelectedTestCase] = useState(null);
    const [newTestCase, setNewTestCase] = useState('');
    const [newTestCaseTags, setNewTestCaseTags] = useState('');
    const theme = useTheme();

    useEffect(() => {
        if (cycleId) {
            loadTestCases();
        }
    }, [cycleId]);

    const loadTestCases = async () => {
        try {
            const cycle = await testCycleService.getTestCycle(cycleId);
            setTestCases(cycle.testCases);
        } catch (error) {
            console.error('Error loading test cases:', error);
        }
    };

    const handleCreateTestCase = async () => {
        try {
            const tags = newTestCaseTags.split(',').map(tag => tag.trim()).filter(Boolean);
            await testCycleService.addTestCase(cycleId, newTestCase, tags);
            setIsCreateDialogOpen(false);
            setNewTestCase('');
            setNewTestCaseTags('');
            loadTestCases();
        } catch (error) {
            console.error('Error creating test case:', error);
        }
    };

    const handleUpdateTestCase = async () => {
        try {
            const tags = newTestCaseTags.split(',').map(tag => tag.trim()).filter(Boolean);
            await testCycleService.updateTestCase(cycleId, selectedTestCase.id, {
                content: newTestCase,
                tags
            });
            setIsEditDialogOpen(false);
            setSelectedTestCase(null);
            setNewTestCase('');
            setNewTestCaseTags('');
            loadTestCases();
        } catch (error) {
            console.error('Error updating test case:', error);
        }
    };

    const handleDeleteTestCase = async (testCaseId) => {
        if (window.confirm('Are you sure you want to delete this test case?')) {
            try {
                await testCycleService.deleteTestCase(cycleId, testCaseId);
                loadTestCases();
            } catch (error) {
                console.error('Error deleting test case:', error);
            }
        }
    };

    const handleEditClick = (testCase) => {
        setSelectedTestCase(testCase);
        setNewTestCase(testCase.content);
        setNewTestCaseTags(testCase.tags.join(', '));
        setIsEditDialogOpen(true);
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4" component="h1">
                    Test Cases
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setIsCreateDialogOpen(true)}
                >
                    Add Test Case
                </Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {testCases.map((testCase) => (
                    <Card key={testCase.id}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Typography variant="body1" sx={{ flex: 1 }}>
                                    {testCase.content}
                                </Typography>
                                <Box>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleEditClick(testCase)}
                                        sx={{ mr: 1 }}
                                    >
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleDeleteTestCase(testCase.id)}
                                        sx={{ color: theme.palette.error.main }}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </Box>
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                Created: {format(convertFirebaseTimestamp(testCase.createdAt), 'MMM d, yyyy')}
                                {testCase.executedAt && (
                                    <span style={{ marginLeft: '16px' }}>
                                        Last Executed: {format(convertFirebaseTimestamp(testCase.executedAt), 'MMM d, yyyy p')}
                                    </span>
                                )}
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                                {testCase.tags.map((tag) => (
                                    <Chip
                                        key={tag}
                                        label={tag}
                                        size="small"
                                        sx={{ mr: 1, mb: 1 }}
                                    />
                                ))}
                            </Box>
                            {needsReExecution(testCase) && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    Some steps have been added or modified. Please re-execute, as the previous run may not be valid.
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </Box>

            {/* Create Test Case Dialog */}
            <Dialog open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)}>
                <DialogTitle>Add New Test Case</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Test Case"
                        fullWidth
                        multiline
                        rows={4}
                        value={newTestCase}
                        onChange={(e) => setNewTestCase(e.target.value)}
                    />
                    <TextField
                        margin="dense"
                        label="Tags (comma-separated)"
                        fullWidth
                        value={newTestCaseTags}
                        onChange={(e) => setNewTestCaseTags(e.target.value)}
                        helperText="Enter tags separated by commas"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleCreateTestCase}
                        variant="contained"
                        disabled={!newTestCase.trim()}
                    >
                        Add
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Test Case Dialog */}
            <Dialog open={isEditDialogOpen} onClose={() => setIsEditDialogOpen(false)}>
                <DialogTitle>Edit Test Case</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Test Case"
                        fullWidth
                        multiline
                        rows={4}
                        value={newTestCase}
                        onChange={(e) => setNewTestCase(e.target.value)}
                    />
                    <TextField
                        margin="dense"
                        label="Tags (comma-separated)"
                        fullWidth
                        value={newTestCaseTags}
                        onChange={(e) => setNewTestCaseTags(e.target.value)}
                        helperText="Enter tags separated by commas"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleUpdateTestCase}
                        variant="contained"
                        disabled={!newTestCase.trim()}
                    >
                        Update
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}; 