import React, { useState, useEffect } from 'react';
import { testCycleService } from '../../services/testCycleService';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    TextField,
    Typography,
    useTheme
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { format } from 'date-fns';

// Helper function to convert Firebase Timestamp to Date
const convertFirebaseTimestamp = (timestamp) => {
    if (!timestamp) return new Date();
    if (timestamp._seconds) {
        return new Date(timestamp._seconds * 1000);
    }
    return new Date(timestamp);
};

export const TestCycleList = ({ onSelectCycle }) => {
    const [testCycles, setTestCycles] = useState([]);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newCycleName, setNewCycleName] = useState('');
    const [newCycleTags, setNewCycleTags] = useState('');
    const theme = useTheme();

    useEffect(() => {
        loadTestCycles();
    }, []);

    const loadTestCycles = async () => {
        try {
            const cycles = await testCycleService.getTestCycles();
            setTestCycles(cycles);
        } catch (error) {
            console.error('Error loading test cycles:', error);
        }
    };

    const handleCreateCycle = async () => {
        try {
            const tags = newCycleTags.split(',').map(tag => tag.trim()).filter(Boolean);
            await testCycleService.createTestCycle(newCycleName, tags);
            setIsCreateDialogOpen(false);
            setNewCycleName('');
            setNewCycleTags('');
            loadTestCycles();
        } catch (error) {
            console.error('Error creating test cycle:', error);
        }
    };

    const handleDeleteCycle = async (cycleId) => {
        if (window.confirm('Are you sure you want to delete this test cycle?')) {
            try {
                await testCycleService.deleteTestCycle(cycleId);
                loadTestCycles();
            } catch (error) {
                console.error('Error deleting test cycle:', error);
            }
        }
    };

    const handleCycleClick = (cycle) => {
        if (onSelectCycle) {
            onSelectCycle(cycle);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4" component="h1">
                    Test Cycles
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setIsCreateDialogOpen(true)}
                >
                    Create Test Cycle
                </Button>
            </Box>

            <Grid container spacing={3}>
                {testCycles.map((cycle) => (
                    <Grid item xs={12} md={6} lg={4} key={cycle.id}>
                        <Card
                            sx={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                '&:hover': {
                                    boxShadow: theme.shadows[4],
                                    cursor: 'pointer'
                                }
                            }}
                            onClick={() => handleCycleClick(cycle)}
                        >
                            <CardContent sx={{ flexGrow: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                    <Typography variant="h6" component="h2" gutterBottom>
                                        {cycle.name}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteCycle(cycle.id);
                                        }}
                                        sx={{ color: theme.palette.error.main }}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </Box>

                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    Created: {format(convertFirebaseTimestamp(cycle.createdAt), 'MMM d, yyyy')}
                                </Typography>

                                <Box sx={{ mt: 2 }}>
                                    {cycle.tags.map((tag) => (
                                        <Chip
                                            key={tag}
                                            label={tag}
                                            size="small"
                                            sx={{ mr: 1, mb: 1 }}
                                        />
                                    ))}
                                </Box>

                                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                    {cycle.testCases?.length || 0} test cases
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Dialog open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)}>
                <DialogTitle>Create New Test Cycle</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Test Cycle Name"
                        fullWidth
                        value={newCycleName}
                        onChange={(e) => setNewCycleName(e.target.value)}
                    />
                    <TextField
                        margin="dense"
                        label="Tags (comma-separated)"
                        fullWidth
                        value={newCycleTags}
                        onChange={(e) => setNewCycleTags(e.target.value)}
                        helperText="Enter tags separated by commas"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleCreateCycle}
                        variant="contained"
                        disabled={!newCycleName.trim()}
                    >
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}; 