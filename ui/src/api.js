import axios from 'axios';
import { ENDPOINTS } from './constants';

const api = axios.create({
  baseURL:  process.env.REACT_APP_SERVER_URL, // adjust as needed
  withCredentials: true, // send cookies (access & refresh tokens)
});

let isRefreshing = false;
let refreshPromise = null;
let requestQueue = [];

// Utility to process queued requests
function processQueue(error, didRefresh) {
  requestQueue.forEach(({ resolve, reject }) => {
    if (didRefresh) {
      resolve();
    } else {
      reject(error);
    }
  });
  requestQueue = [];
}

// Response interceptor to catch 401 and retry
api.interceptors.response.use(
  res => res,
  async error => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      ['token_expired', 'missing_or_expired'].includes(error.response?.data?.errorCode) &&
      !originalRequest._retry
    ) {
      if (!isRefreshing) {
        isRefreshing = true;
        originalRequest._retry = true;

        refreshPromise = api
          .post(ENDPOINTS.REFRESH)
          .then(() => {
            processQueue(null, true);
            return api(originalRequest); // retry original request
          })
          .catch(err => {
            processQueue(err, false);
            throw err;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });

        return refreshPromise;
      }

      // Queue the request if refresh is already in progress
      return new Promise((resolve, reject) => {
        requestQueue.push({
          resolve: () => {
            originalRequest._retry = true;
            resolve(api(originalRequest));
          },
          reject: err => {
            reject(err);
          },
        });
      });
    }

    return Promise.reject(error);
  }
);

export default api;
