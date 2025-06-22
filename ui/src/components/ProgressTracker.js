import React from 'react';
import { Box, Stepper, Step, StepLabel, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Check, AutoAwesome, Analytics } from '@mui/icons-material';

const QontoStepIconRoot = styled('div')(({ theme, ownerState }) => ({
    color: theme.palette.mode === 'dark' ? theme.palette.grey[700] : '#eaeaf0',
    display: 'flex',
    height: 22,
    alignItems: 'center',
    ...(ownerState.active && {
        color: '#784af4',
    }),
    '& .QontoStepIcon-completedIcon': {
        color: '#784af4',
        zIndex: 1,
        fontSize: 18,
    },
    '& .QontoStepIcon-circle': {
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: 'currentColor',
    },
}));

function QontoStepIcon(props) {
    const { active, completed, className } = props;

    return (
        <QontoStepIconRoot ownerState={{ active }} className={className}>
            {completed ? (
                <Check className="QontoStepIcon-completedIcon" />
            ) : (
                <div className="QontoStepIcon-circle" />
            )}
        </QontoStepIconRoot>
    );
}

const steps = [
    {
        label: 'Agent Running',
        icon: <Analytics />,
    },
    {
        label: 'AI Validation',
        icon: <AutoAwesome />,
    },
    {
        label: 'Report Generated',
        icon: <Check />,
    },
];

export const ProgressTracker = ({ status }) => {
    let activeStep = 0;
    if (status === 'executing_validation') {
        activeStep = 1;
    } else if (status === 'completed') {
        activeStep = 2;
    } else if (status === 'error') {
        // Handle error state if needed, e.g., show an error icon on the current step
    }

    return (
        <Box sx={{ width: '100%', mt: 3 }}>
            <Stepper activeStep={activeStep} alternativeLabel>
                {steps.map((step, index) => (
                    <Step key={step.label}>
                        <StepLabel
                            StepIconComponent={(props) => (
                                <Box sx={{ color: activeStep >= index ? '#784af4' : 'grey.500', transition: 'color 0.3s' }}>
                                    {React.cloneElement(step.icon, {
                                        ...props,
                                        className: `${props.className} ${activeStep >= index ? 'completed' : ''}`,
                                    })}
                                </Box>
                            )}
                        >
                            <Typography sx={{ fontWeight: activeStep === index ? 'bold' : 'normal' }}>
                                {step.label}
                            </Typography>
                        </StepLabel>
                    </Step>
                ))}
            </Stepper>
        </Box>
    );
}; 