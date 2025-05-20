// Mock environment variables
process.env.REACT_APP_SERVER_URL = 'https://localhost';

// Mock axios module
let errorCallback = null;
let successCallback = null;
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });
    failedQueue = [];
};

const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
    interceptors: {
        response: {
            use: jest.fn((success, error) => {
                successCallback = success;
                errorCallback = error;
                return () => { };
            })
        }
    }
};

// Create API mock with the actual implementation
const createApiMock = () => {
    const instance = mockAxiosInstance;

    instance.interceptors.response.use(
        response => response,
        async error => {
            const originalRequest = error.config;

            if (error.response?.status === 401 && error.response?.data?.errorCode === 'token_expired' && !originalRequest._retry) {
                if (isRefreshing) {
                    try {
                        await new Promise((resolve, reject) => {
                            failedQueue.push({ resolve, reject });
                        });
                        return instance.request(originalRequest);
                    } catch (err) {
                        return Promise.reject(err);
                    }
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    const response = await instance.post(ENDPOINTS.REFRESH);
                    const { token } = response.data;
                    originalRequest.headers['Authorization'] = `Bearer ${token}`;
                    processQueue(null);
                    isRefreshing = false;
                    return instance.request(originalRequest);
                } catch (err) {
                    processQueue(err);
                    isRefreshing = false;
                    return Promise.reject(err);
                }
            }
            return Promise.reject(error);
        }
    );

    return instance;
};

jest.mock('axios', () => ({
    create: jest.fn(() => mockAxiosInstance),
    isAxiosError: jest.fn(error => error && error.isAxiosError)
}));

// Import constants
const { ENDPOINTS } = require('../../constants');

describe('API Module', () => {
    beforeAll(() => {
        // Create and initialize the API instance
        createApiMock();
    });

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        // Reset state
        isRefreshing = false;
        failedQueue = [];
        // Reset request mock default behavior
        mockAxiosInstance.request.mockImplementation((config) => {
            return Promise.resolve({ data: 'success' });
        });
    });

    describe('Token Refresh', () => {
        const mockOriginalRequest = {
            _retry: false,
            headers: {},
            method: 'get',
            url: '/test'
        };

        const mockError = {
            config: { ...mockOriginalRequest },
            response: {
                status: 401,
                data: { errorCode: 'token_expired' }
            },
            isAxiosError: true
        };

        beforeEach(() => {
            mockAxiosInstance.request.mockImplementation((config) => {
                return Promise.resolve({ data: config._retry ? 'retried_success' : 'success' });
            });
        });

        it('should attempt to refresh token on 401 error', async () => {
            const newToken = 'new_token';
            mockAxiosInstance.post.mockResolvedValueOnce({ data: { token: newToken } });
            mockAxiosInstance.request.mockResolvedValueOnce({ data: 'retried_success' });

            const result = await errorCallback(mockError);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith(ENDPOINTS.REFRESH);
            expect(result.data).toBe('retried_success');
            expect(mockError.config._retry).toBe(true);
            expect(mockError.config.headers['Authorization']).toBe(`Bearer ${newToken}`);
        });

    });

    describe('Request Queue', () => {
        const mockError = {
            config: {
                _retry: false,
                method: 'get',
                url: '/test',
                headers: {}
            },
            response: {
                status: 401,
                data: { errorCode: 'token_expired' }
            },
            isAxiosError: true
        };

        it('should queue requests while refreshing token', async () => {
            const newToken = 'new_token';
            mockAxiosInstance.post.mockResolvedValueOnce({ data: { token: newToken } });
            mockAxiosInstance.request.mockResolvedValue({ data: 'queued_success' });

            // Start first request to trigger refresh
            const firstRequest = errorCallback({ ...mockError, config: { ...mockError.config } });

            // Queue additional requests
            const secondRequest = errorCallback({ ...mockError, config: { ...mockError.config } });
            const thirdRequest = errorCallback({ ...mockError, config: { ...mockError.config } });

            const results = await Promise.all([firstRequest, secondRequest, thirdRequest]);

            expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
            results.forEach(result => {
                expect(result.data).toBe('queued_success');
            });
        });

        it('should reject queued requests if refresh fails', async () => {
            const refreshError = new Error('Refresh failed');
            mockAxiosInstance.post.mockRejectedValueOnce(refreshError);

            // Start first request to trigger refresh
            const firstRequest = errorCallback({ ...mockError, config: { ...mockError.config } });

            // Queue second request
            const secondRequest = errorCallback({ ...mockError, config: { ...mockError.config } });

            await expect(Promise.all([firstRequest, secondRequest]))
                .rejects.toThrow('Refresh failed');
        });
    });

    describe('Error Handling', () => {
        it('should pass through non-401 errors', async () => {
            const error = {
                response: {
                    status: 500,
                    data: { message: 'Server error' }
                },
                isAxiosError: true
            };

            await expect(errorCallback(error))
                .rejects.toEqual(error);
        });

        it('should pass through 401 errors with different error codes', async () => {
            const error = {
                response: {
                    status: 401,
                    data: { errorCode: 'invalid_token' }
                },
                isAxiosError: true
            };

            await expect(errorCallback(error))
                .rejects.toEqual(error);
        });
    });
}); 