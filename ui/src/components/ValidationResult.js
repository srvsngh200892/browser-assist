import React from 'react';
import { Box, Typography, Paper, Icon, Button } from '@mui/material';
import { format } from 'date-fns';
import { CheckCircle, Cancel, Help, RadioButtonUnchecked as IgnoredIcon, Download } from '@mui/icons-material';

const statusInfo = {
    passed: {
        color: '#48bb78', // green-500
        icon: <CheckCircle />,
        text: 'PASSED'
    },
    failed: {
        color: '#e53e3e', // red-500
        icon: <Cancel />,
        text: 'FAILED'
    },
    invisible: {
        color: '#a0aec0', // gray-500
        icon: <Help />,
        text: 'INVISIBLE'
    },
    ignored: {
        color: '#a0aec0', // gray-500
        icon: <IgnoredIcon />,
        text: 'IGNORED'
    }
};

const convertFirebaseTimestamp = (timestamp) => {
    if (!timestamp) return new Date();
    if (timestamp._seconds) {
        return new Date(timestamp._seconds * 1000 + (timestamp._nanoseconds || 0) / 1000000);
    }
    return new Date(timestamp);
};

export const ValidationResult = ({ result, onDownload }) => {
    if (!result || !result.steps) {
        return null;
    }

    const { steps, finalResult, createdAt } = result;
    const overallStatus = finalResult === 'Pass' ? 'passed' : 'failed';

    return (
        <Box sx={{ mt: 3 }}>
            {/* Overall Result Header */}
            <Paper elevation={2} sx={{
                p: 1.5,
                bgcolor: statusInfo[overallStatus].color,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                borderRadius: 2
            }}>
                <Icon sx={{ color: 'white' }}>{statusInfo[overallStatus].icon}</Icon>
                <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: '1.1rem', flexGrow: 1 }}>
                    Validation Results - {statusInfo[overallStatus].text}
                </Typography>
                {createdAt && (
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                        Executed On: {format(convertFirebaseTimestamp(createdAt), 'MMM d, yyyy, h:mm a')}
                    </Typography>
                )}
            </Paper>

            {/* Steps */}
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {steps.map((step, index) => {
                    const stepStatus = statusInfo[step.status] || statusInfo.ignored;
                    return (
                        <Paper key={index} elevation={1} sx={{
                            display: 'flex',
                            borderLeft: `5px solid ${stepStatus.color}`,
                            borderRadius: '4px',
                            overflow: 'hidden'
                        }}>
                            <Box sx={{ p: 2, flexGrow: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                    <Box sx={{
                                        bgcolor: '#7c3aed', // purple-600
                                        color: 'white',
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold'
                                    }}>
                                        {index + 1}
                                    </Box>
                                    <Typography variant="body1" sx={{ fontWeight: 600, flexGrow: 1 }}>
                                        {step.step}
                                    </Typography>
                                    <Icon sx={{ color: stepStatus.color, fontSize: 28 }}>
                                        {stepStatus.icon}
                                    </Icon>
                                </Box>
                                <Typography variant="body2" color="text.secondary" sx={{ pl: '44px' }}>
                                    {step.explanation}
                                </Typography>
                            </Box>
                        </Paper>
                    );
                })}
            </Box>
        </Box>
    );
}; 