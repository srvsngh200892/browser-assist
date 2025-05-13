import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import api from '../api'; // your axios instance
import { ENDPOINTS } from '../constants';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(localStorage.getItem('session_id'));

  const handleLoginSuccess = useCallback((userData, sessionIdFromLogin) => {
    setIsAuthenticated(true);
    setUser(userData);
    setSessionId(sessionIdFromLogin);
    localStorage.setItem('session_id', sessionIdFromLogin);
  }, []);

  // Logout logic
  const handleLogout = useCallback((deleteData = true) => {
    const currentSessionId = sessionId;
    if (currentSessionId) {
      api.post(ENDPOINTS.LOGOUT, {
        sessionId: currentSessionId,
        deleteData: !!deleteData
      })
        .then(() => {
          console.log('Logout successful');
          setIsAuthenticated(false);
          setUser(null);
          setSessionId(null);
          localStorage.clear();
          // Redirect user to the login page or home after logout
          setTimeout(() => {
            window.location.href = window.location.origin; // more reliable than reload()
          }, 50);
        })
        .catch((error) => {
          console.error('Logout error:', error);
          throw error;
        });
    }
  }, [sessionId]);


  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get(ENDPOINTS.AUTH_CHECK);
        if (res.data.isAuthenticated) {
          setIsAuthenticated(true);
          setUser(res.data.user);
          setSessionId(localStorage.getItem('session_id'));
        }
      } catch {
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        sessionId,
        setSessionId,
        handleLoginSuccess,
        handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
