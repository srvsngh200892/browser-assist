import { API_BASE_URL, ENDPOINTS } from '../../constants/urls';

describe('URL Constants', () => {
    describe('API_BASE_URL', () => {
        it('should be defined', () => {
            expect(API_BASE_URL).toBeDefined();
        });

        it('should be a string starting with /api', () => {
            expect(API_BASE_URL).toBe('/api');
        });
    });

    describe('ENDPOINTS', () => {
        it('should be defined', () => {
            expect(ENDPOINTS).toBeDefined();
        });

        it('should have all required static endpoints', () => {
            const requiredEndpoints = [
                'LOGIN',
                'LOGOUT',
                'AUTH_CHECK',
                'PING',
                'REFRESH',
                'SESSION',
                'REGISTER',
                'GET_SCREENSHOTS',
                'CHECK_HEALTH',
                'STREAM_DISCONNECT',
                'STREAM_CONTROL',
                'DOWNLOAD_VALIDATION_REPORT',
                'VALIDATE_VIA_AI'
            ];

            requiredEndpoints.forEach(endpoint => {
                expect(ENDPOINTS[endpoint]).toBeDefined();
                expect(ENDPOINTS[endpoint]).toContain(API_BASE_URL);
            });
        });

        it('should have all required dynamic endpoints', () => {
            const dynamicEndpoints = [
                'GET_VALIDATE_VIA_AI_STATUS',
                'GET_STREAM',
                'GET_MESSAGE',
                'GET_SESSION',
                'SEND_MESSAGE',
                'VALIDATION_STATUS',
                'GET_VALIDATION_REPORT_STATUS',
                'GENERATE_VALIDATION_REPORT'
            ];

            const testSessionId = 'test-session-123';

            dynamicEndpoints.forEach(endpoint => {
                expect(ENDPOINTS[endpoint]).toBeDefined();
                expect(typeof ENDPOINTS[endpoint]).toBe('function');
                expect(ENDPOINTS[endpoint](testSessionId)).toContain(API_BASE_URL);
                expect(ENDPOINTS[endpoint](testSessionId)).toContain(testSessionId);
            });
        });

        it('should format dynamic endpoints correctly', () => {
            const testSessionId = 'test-session-123';

            expect(ENDPOINTS.GET_STREAM(testSessionId)).toBe(`${API_BASE_URL}/browser-stream/${testSessionId}`);
            expect(ENDPOINTS.GET_SESSION(testSessionId)).toBe(`${API_BASE_URL}/session/${testSessionId}`);
            expect(ENDPOINTS.SEND_MESSAGE(testSessionId)).toBe(`${API_BASE_URL}/chat/${testSessionId}`);
        });
    });
}); 