import api from '../api'

const API_BASE_URL = '/api'

export const testCycleService = {
    // Test Cycle operations
    createTestCycle: async (name, tags = []) => {
        const response = await api.post(`${API_BASE_URL}/test-cycles`, { name, tags });
        return response.data;
    },

    getTestCycles: async (options = {}) => {
        const response = await api.get(`${API_BASE_URL}/test-cycles`, { params: options });
        return response.data;
    },

    getTestCycle: async (cycleId) => {
        const response = await api.get(`${API_BASE_URL}/test-cycles/${cycleId}`);
        return response.data;
    },

    deleteTestCycle: async (cycleId) => {
        await api.delete(`${API_BASE_URL}/test-cycles/${cycleId}`);
    },

    updateTestCycleTags: async (cycleId, tags) => {
        await api.put(`${API_BASE_URL}/test-cycles/${cycleId}/tags`, { tags });
    },

    // Test Case operations
    addTestCase: async (cycleId, content, tags = [], jiraIssueIds = [], jiraTestIds = []) => {
        await api.post(`${API_BASE_URL}/test-cycles/${cycleId}/test-cases`, { description: content, tags, jiraIssueIds, jiraTestIds });
    },

    updateTestCase: async (cycleId, testCaseId, updates) => {
        await api.put(`${API_BASE_URL}/test-cycles/${cycleId}/test-cases/${testCaseId}`, updates);
    },

    deleteTestCase: async (cycleId, testCaseId) => {
        await api.delete(`${API_BASE_URL}/test-cycles/${cycleId}/test-cases/${testCaseId}`);
    },

    findTestCasesByTag: async (tag, options = {}) => {
        const response = await api.get(`${API_BASE_URL}/test-cases/by-tag/${tag}`, { params: options });
        return response.data;
    },

    getRunStatus: async (testCaseId) => {
        const response = await api.get(`/api/test-cases/${testCaseId}/run-status`);
        return response.data;
    },

    executeTestCase: async (testCase) => {
        const response = await api.post(`/api/chat/test-case/${testCase.id}`, {
            userMessage: {
                role: "user",
                content: testCase.description,
            }
        });
        return response.data;
    },

    getSessionStatus: async (sessionId) => {
        const response = await api.get(`/api/session/${sessionId}`);
        return response.data;
    },

    getValidationReportStatus: async (sessionId) => {
        const response = await api.get(`/api/validation/report/${sessionId}/status`);
        return response.data;
    },

    downloadArtifact: async (fileUrl) => {
        const response = await api.post(`/api/validation/download-from-storage`, { fileUrl }, {
            responseType: 'blob', // Important for file downloads
        });
        // Create a link and trigger the download
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        const disposition = response.headers['content-disposition'];
        let filename = 'artifact.zip'; // Default filename
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) {
                filename = matches[1].replace(/['"]/g, '');
            }
        }
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    addStep: async (cycleId, testCaseId, stepData) => {
        const response = await api.post(`${API_BASE_URL}/test-cycles/${cycleId}/test-cases/${testCaseId}/steps`, stepData);
        return response.data;
    },

    importSharedStep: async (cycleId, testCaseId, stepId) => {
        const response = await api.post(`${API_BASE_URL}/test-cycles/${cycleId}/test-cases/${testCaseId}/steps`, { stepId });
        return response.data;
    },

    getSharedSteps: async () => {
        const response = await api.get(`${API_BASE_URL}/shared-steps`);
        return response.data;
    },

    updateStep: async (cycleId, testCaseId, stepId, stepData) => {
        const response = await api.put(`${API_BASE_URL}/test-cycles/${cycleId}/test-cases/${testCaseId}/steps/${stepId}`, stepData);
        return response.data;
    },

    deleteStep: async (cycleId, testCaseId, stepId) => {
        const response = await api.delete(`${API_BASE_URL}/test-cycles/${cycleId}/test-cases/${testCaseId}/steps/${stepId}`);
        return response.data;
    },

    generateReport: async (testCaseId) => api.post(`${API_BASE_URL}/validation/test-case-report/${testCaseId}/generate`),
    getReportStatus: async (testCaseId) => {
        const response = await api.get(`${API_BASE_URL}/validation/report/${testCaseId}/status`);
        return response.data;
    },
    downloadReport: async (fileUrl, testCaseId) => {
        const response = await api.post(`${API_BASE_URL}/validation/download-from-storage`, { fileUrl }, {
            responseType: 'blob', // Important for handling file downloads
        });
        // Create blob URL and trigger download
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `validation-report-${testCaseId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    },

    deleteSharedStep: async (stepId) => {
        const response = await api.delete(`${API_BASE_URL}/shared-steps/${stepId}`);
        return response.data;
    },

    getSharedStepUsage: async (stepId) => {
        const response = await api.get(`${API_BASE_URL}/shared-steps/${stepId}/usage`);
        return response.data;
    },

    createSharedStep: async (stepData) => {
        const { groupId, ...restData } = stepData;
        const url = groupId
            ? `${API_BASE_URL}/groups/${groupId}/shared-steps`
            : `${API_BASE_URL}/shared-steps`;
        const response = await api.post(url, restData);
        return response.data;
    },

    updateSharedStep: async (stepId, stepData) => {
        const response = await api.put(`${API_BASE_URL}/shared-steps/${stepId}`, stepData);
        return response.data;
    },

    getGroups: async (type = 'step') => {
        const response = await api.get(`${API_BASE_URL}/groups`, { params: { type } });
        return response.data;
    },

    getSharedStepsByGroup: async (groupId) => {
        const response = await api.get(`${API_BASE_URL}/groups/${groupId}/steps`);
        return response.data;
    },

    //create group
    createGroup: async (name, type = 'step') => {
        const response = await api.post(`${API_BASE_URL}/groups`, { name, type });
        return response.data;
    },
    //
}; 