import React, { useState, useEffect } from 'react';
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
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    ListSubheader,
    Toolbar
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Close as CloseIcon } from '@mui/icons-material';
import { testCycleService } from '../services/testCycleService';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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

export const SharedStepsPage = () => {
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [sharedSteps, setSharedSteps] = useState([]);
    const [selectedStep, setSelectedStep] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [editingStep, setEditingStep] = useState(null);
    const [deleteStepTarget, setDeleteStepTarget] = useState(null);
    const [usageWarning, setUsageWarning] = useState(null);

    useEffect(() => {
        loadGroups();
    }, []);

    const loadGroups = async (groupToSelectId = null) => {
        setLoading(true);
        try {
            const fetchedGroups = await testCycleService.getGroups('step');
            setGroups(fetchedGroups);

            if (groupToSelectId) {
                const groupToSelect = fetchedGroups.find(g => g.id === groupToSelectId);
                if (groupToSelect) {
                    handleGroupSelect(groupToSelect);
                }
            } else if (fetchedGroups.length > 0) {
                handleGroupSelect(fetchedGroups[0]);
            }
        } catch (error) {
            toast.error("Failed to load groups.");
        } finally {
            setLoading(false);
        }
    };

    const handleGroupSelect = async (group) => {
        setLoading(true);
        setSelectedGroup(group);
        try {
            const steps = await testCycleService.getSharedStepsByGroup(group.id);
            setSharedSteps(steps);
            if (steps.length > 0) {
                setSelectedStep(steps[0]);
            } else {
                setSelectedStep(null);
            }
        } catch (error) {
            toast.error(`Failed to load steps for group ${group.name}.`);
            setSharedSteps([]);
            setSelectedStep(null);
        } finally {
            setLoading(false);
        }
    };

    const handleStepSelect = (step) => {
        setSelectedStep(step);
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            toast.warn("Group name cannot be empty.");
            return;
        }
        try {
            const newGroup = await testCycleService.createGroup(newGroupName, 'step');
            setShowCreateGroup(false);
            setNewGroupName('');
            toast.success("Group created successfully!");
            await loadGroups(newGroup.id);
        } catch (error) {
            toast.error("Failed to create group.");
        }
    };

    const handleNewStepClick = () => {
        if (!selectedGroup) {
            toast.warn("Please select a group first to create a new step in it.");
            return;
        }
        setEditingStep({
            name: '',
            content: '',
            tags: [],
            groupId: selectedGroup.id,
        });
    };

    const handleEditStepClick = (step) => {
        setEditingStep({ ...step, tags: step.tags || [] });
    };

    const handleSaveStep = async () => {
        if (!editingStep?.name?.trim() || !editingStep?.content?.trim()) {
            toast.warn("Step name and content cannot be empty.");
            return;
        }

        try {
            if (editingStep.id) { // Update existing step
                await testCycleService.updateSharedStep(editingStep.id, {
                    name: editingStep.name,
                    content: editingStep.content,
                    tags: editingStep.tags,
                    groupId: editingStep.groupId === '' ? null : editingStep.groupId,
                });
                toast.success("Step updated successfully!");
            } else { // Create new step
                await testCycleService.createSharedStep({
                    name: editingStep.name,
                    content: editingStep.content,
                    tags: editingStep.tags,
                    groupId: editingStep.groupId,
                });
                toast.success("Step created successfully!");
            }
            setEditingStep(null);
            await handleGroupSelect(selectedGroup); // Refresh steps in the current group
        } catch (error) {
            toast.error(`Failed to save step: ${error.message}`);
        }
    };

    const handleDeleteStepClick = async (step) => {
        try {
            const { usageCount } = await testCycleService.getSharedStepUsage(step.id);
            if (usageCount > 0) {
                setUsageWarning({ step, count: usageCount });
            } else {
                setDeleteStepTarget(step);
            }
        } catch (error) {
            toast.error("Could not check step usage. Please try again.");
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteStepTarget) return;
        try {
            const result = await testCycleService.deleteSharedStep(deleteStepTarget.id);
            toast.success(result.message || "Step deleted successfully!");
            setDeleteStepTarget(null);
            await handleGroupSelect(selectedGroup); // Refresh steps
        } catch (error) {
            toast.error(error.response?.data?.error || "Failed to delete step.");
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, bgcolor: LIGHT_PURPLE, overflow: 'hidden' }}>
            <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
            <Box sx={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, gap: 2, px: 2, py: 2 }}>
                {/* Left: Groups List */}
                <Paper elevation={2} sx={{ width: 280, p: 0, overflowY: 'auto', borderRadius: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, pb: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>Groups</Typography>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            size="small"
                            sx={{ bgcolor: PURPLE, color: 'white', fontWeight: 600, borderRadius: 2, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9' } }}
                            onClick={() => setShowCreateGroup(true)}
                        >
                            New Group
                        </Button>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
                        {groups.map((group) => (
                            <Paper
                                key={group.id}
                                onClick={() => handleGroupSelect(group)}
                                elevation={selectedGroup?.id === group.id ? 4 : 1}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    cursor: 'pointer',
                                    border: `1px solid ${selectedGroup?.id === group.id ? PURPLE : '#e0e0e0'}`,
                                    bgcolor: selectedGroup?.id === group.id ? LIGHT_PURPLE : 'white',
                                }}
                            >
                                <Typography sx={{ fontWeight: 600, color: '#374151' }}>{group.name}</Typography>
                            </Paper>
                        ))}
                    </Box>
                </Paper>

                {/* Middle: Shared Steps List */}
                <Paper elevation={2} sx={{ width: 340, borderRadius: 3, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ p: 2, pb: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
                                {selectedGroup ? selectedGroup.name : 'Select a group'}
                            </Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                size="small"
                                sx={{ bgcolor: PURPLE, color: 'white', fontWeight: 600, '&:hover': { bgcolor: '#6d28d9' } }}
                                disabled={!selectedGroup}
                                onClick={handleNewStepClick}
                            >
                                New Step
                            </Button>
                        </Box>
                        <Divider />
                    </Box>
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {sharedSteps.map((step) => (
                            <Paper
                                key={step.id}
                                onClick={() => handleStepSelect(step)}
                                elevation={selectedStep?.id === step.id ? 4 : 1}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    cursor: 'pointer',
                                    border: `1px solid ${selectedStep?.id === step.id ? PURPLE : '#e0e0e0'}`,
                                    bgcolor: selectedStep?.id === step.id ? LIGHT_PURPLE : 'white',
                                }}
                            >
                                <Typography sx={{ fontWeight: 500, color: 'text.secondary', mr: 1 }}>{step.name}</Typography>
                            </Paper>
                        ))}
                    </Box>
                </Paper>

                {/* Right: Step Details */}
                <Paper elevation={2} sx={{ flex: 1, p: 3, borderRadius: 3, minWidth: 0, overflowY: 'auto' }}>
                    {selectedStep ? (
                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                    {selectedStep.name}
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                    <IconButton onClick={() => handleEditStepClick(selectedStep)}><EditIcon /></IconButton>
                                    <IconButton onClick={() => handleDeleteStepClick(selectedStep)}><DeleteIcon /></IconButton>
                                </Stack>
                            </Box>
                            <Divider sx={{ my: 2 }} />
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                Prompt:
                            </Typography>
                            <Box sx={{ mb: 2, p: 2, border: '1px solid #eee', borderRadius: 2, background: '#f8fafc', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {selectedStep.content}
                            </Box>
                            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                                {selectedStep.tags?.map(tag => (
                                    <Chip key={tag} label={tag} size="small" />
                                ))}
                            </Stack>
                        </Box>
                    ) : (
                        <Typography variant="body1" color="text.secondary">Select a step to see details.</Typography>
                    )}
                </Paper>
            </Box>

            {/* Create Group Dialog */}
            {showCreateGroup && (
                <Dialog open={showCreateGroup} onClose={() => setShowCreateGroup(false)}>
                    <DialogTitle>Create New Group</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Group Name"
                            type="text"
                            fullWidth
                            variant="outlined"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            sx={focusedInputStyle}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setShowCreateGroup(false)}>Cancel</Button>
                        <Button onClick={handleCreateGroup} variant="contained" sx={{ bgcolor: PURPLE }}>Create</Button>
                    </DialogActions>
                </Dialog>
            )}

            {/* Create/Edit Step Dialog */}
            <Dialog open={!!editingStep} onClose={() => setEditingStep(null)} maxWidth="sm" fullWidth>
                <DialogTitle>{editingStep?.id ? 'Edit Shared Step' : 'Create New Shared Step'}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Step Name"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={editingStep?.name || ''}
                        onChange={(e) => setEditingStep({ ...editingStep, name: e.target.value })}
                        sx={{ mt: 1, ...focusedInputStyle }}
                    />
                    <TextField
                        margin="dense"
                        label="Step Content"
                        type="text"
                        fullWidth
                        multiline
                        rows={4}
                        variant="outlined"
                        value={editingStep?.content || ''}
                        onChange={(e) => setEditingStep({ ...editingStep, content: e.target.value })}
                        sx={{ mt: 2, ...focusedInputStyle }}
                    />
                    <TextField
                        margin="dense"
                        label="Tags (comma-separated)"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={editingStep?.tags?.join(', ') || ''}
                        onChange={(e) => setEditingStep({ ...editingStep, tags: e.target.value.split(',').map(t => t.trim()) })}
                        sx={{ mt: 2, ...focusedInputStyle }}
                    />
                    <TextField
                        select
                        margin="dense"
                        label="Group"
                        fullWidth
                        variant="outlined"
                        value={editingStep?.groupId || ''}
                        onChange={(e) => setEditingStep({ ...editingStep, groupId: e.target.value })}
                        sx={{ mt: 2, ...focusedInputStyle }}
                        SelectProps={{ native: true }}
                    >
                        <option value="">Ungrouped</option>
                        {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                                {group.name}
                            </option>
                        ))}
                    </TextField>
                </DialogContent>
                <DialogActions sx={{ p: '0 24px 16px' }}>
                    <Button onClick={() => setEditingStep(null)}>Cancel</Button>
                    <Button onClick={handleSaveStep} variant="contained" sx={{ bgcolor: PURPLE }}>Save</Button>
                </DialogActions>
            </Dialog>

            {/* Confirm Delete Step Dialog */}
            <Dialog open={!!deleteStepTarget} onClose={() => setDeleteStepTarget(null)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the step <b>{deleteStepTarget?.name}</b>?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteStepTarget(null)}>Cancel</Button>
                    <Button onClick={handleConfirmDelete} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>

            {/* Usage Warning Dialog */}
            <Dialog open={!!usageWarning} onClose={() => setUsageWarning(null)}>
                <DialogTitle>Cannot Delete Step</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        The step <b>{usageWarning?.step.name}</b> cannot be deleted because it is currently used in <b>{usageWarning?.count}</b> test case(s).
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setUsageWarning(null)}>OK</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}; 