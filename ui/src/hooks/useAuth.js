// src/hooks/useAuth.js
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthProvider';

export const useAuth = () => useContext(AuthContext);