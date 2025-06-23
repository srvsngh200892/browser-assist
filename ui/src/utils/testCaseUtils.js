// Helper function to convert Firebase Timestamp to a JavaScript Date object.
const convertFirebaseTimestamp = (timestamp) => {
    if (!timestamp) return null;
    if (timestamp._seconds !== undefined && timestamp._nanoseconds !== undefined) {
        return new Date(timestamp._seconds * 1000 + timestamp._nanoseconds / 1000000);
    }
    // Fallback for other potential timestamp formats
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
        return d;
    }
    return null;
};

/**
 * Checks if a test case needs to be re-executed based on step modification dates.
 * @param {object} testCase - The test case object, expected to have executedAt and steps properties.
 * @returns {boolean} - True if re-execution is needed, false otherwise.
 */
export const needsReExecution = (testCase) => {
    if (!testCase || !testCase.executedAt || !testCase.steps || testCase.steps.length === 0) {
        return false;
    }

    const executedAtDate = convertFirebaseTimestamp(testCase.executedAt);

    if (!executedAtDate) {
        return false;
    }

    //also check if testcase was updated after the last execution
    const updatedAtDate = convertFirebaseTimestamp(testCase.updatedAt);
    if (updatedAtDate && updatedAtDate > executedAtDate) {
        return true;
    }

    return testCase.steps.some(step => {
        const createdAtDate = convertFirebaseTimestamp(step.createdAt);
        const updatedAtDate = convertFirebaseTimestamp(step.updatedAt);

        // Check if any step was created or updated after the last execution.
        return (createdAtDate && createdAtDate > executedAtDate) || (updatedAtDate && updatedAtDate > executedAtDate);
    });
}; 