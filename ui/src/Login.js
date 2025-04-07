import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Login.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

function Login({ onLoginSuccess }) {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [passwordVisible, setPasswordVisible] = useState(false);

    // Field-specific validation states
    const [validationErrors, setValidationErrors] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    // Track if fields have been touched
    const [touched, setTouched] = useState({
        username: false,
        email: false,
        password: false,
        confirmPassword: false
    });

    // Clear messages when switching between login and register
    useEffect(() => {
        setError('');
        setSuccess('');
        setValidationErrors({
            username: '',
            email: '',
            password: '',
            confirmPassword: ''
        });
        setTouched({
            username: false,
            email: false,
            password: false,
            confirmPassword: false
        });
    }, [isLogin]);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData({
            ...formData,
            [name]: value
        });

        // Validate field on change if it's been touched
        if (touched[name]) {
            validateField(name, value);
        }
    };

    const handleBlur = (e) => {
        const { name, value } = e.target;

        // Mark field as touched
        setTouched({
            ...touched,
            [name]: true
        });

        // Validate field on blur
        validateField(name, value);
    };

    const validateField = (name, value) => {
        let errorMessage = '';

        switch (name) {
            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!value.trim()) {
                    errorMessage = 'Email is required';
                } else if (!emailRegex.test(value)) {
                    errorMessage = 'Please enter a valid email address';
                }
                break;

            case 'password':
                if (!value) {
                    errorMessage = 'Password is required';
                } else if (value.length < 6) {
                    errorMessage = 'Password must be at least 6 characters';
                }

                // Also validate confirmPassword if it's been touched
                if (touched.confirmPassword && !isLogin) {
                    validateField('confirmPassword', formData.confirmPassword);
                }
                break;

            case 'confirmPassword':
                if (!isLogin && value !== formData.password) {
                    errorMessage = 'Passwords do not match';
                }
                break;

            case 'username':
                if (!isLogin && !value.trim()) {
                    errorMessage = 'Username is required';
                }
                break;

            default:
                break;
        }

        setValidationErrors(prev => ({
            ...prev,
            [name]: errorMessage
        }));

        return !errorMessage;
    };

    const togglePasswordVisibility = () => {
        setPasswordVisible(!passwordVisible);
    };

    const validateForm = () => {
        // Validate all fields
        const usernameValid = validateField('username', formData.username);
        const emailValid = validateField('email', formData.email);
        const passwordValid = validateField('password', formData.password);
        const confirmPasswordValid = !isLogin ? validateField('confirmPassword', formData.confirmPassword) : true;

        // Mark all fields as touched
        setTouched({
            username: true,
            email: true,
            password: true,
            confirmPassword: !isLogin
        });

        // Return true if all relevant fields are valid
        return emailValid && passwordValid && (isLogin || (usernameValid && confirmPasswordValid));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate form
        if (!validateForm()) {
            return;
        }

        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const payload = isLogin
                ? { email: formData.email, password: formData.password }
                : { username: formData.username, email: formData.email, password: formData.password };

            const response = await axios.post(`${SERVER_URL}${endpoint}`, payload);

            if (response.data.success) {
                // Show success message
                setSuccess(isLogin ? 'Login successful!' : 'Account created successfully!');

                // Store token and user data
                localStorage.setItem('auth_token', response.data.token);
                localStorage.setItem('user', JSON.stringify(response.data.user));

                // Store session ID if available (for login)
                if (isLogin && response.data.sessionId) {
                    localStorage.setItem('session_id', response.data.sessionId);
                    console.log('Session created with ID:', response.data.sessionId);
                }

                // Slight delay before redirecting for better UX
                setTimeout(() => {
                    // Notify parent component
                    onLoginSuccess(response.data.user);
                }, 1000);
            } else {
                setError(response.data.error || 'Authentication failed');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // Helper function to determine if a field is valid
    const getFieldStatus = (fieldName) => {
        if (!touched[fieldName]) return '';
        return validationErrors[fieldName] ? 'invalid' : 'valid';
    };

    return (
        <div className="auth-container">
            <div className="auth-form">
                <div className="logo-container">
                    <div className="logo">🤖</div>
                </div>
                <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                <div className="subtitle">{isLogin ? 'Sign in to continue' : 'Join our community'}</div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <form onSubmit={handleSubmit} noValidate>
                    {!isLogin && (
                        <div className={`form-group ${getFieldStatus('username')}`}>
                            <label htmlFor="username">Username</label>
                            <div className="input-wrapper">
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    required={!isLogin}
                                    placeholder="Enter your username"
                                />
                                {getFieldStatus('username') === 'valid' && <span className="validation-icon valid">✓</span>}
                                {getFieldStatus('username') === 'invalid' && <span className="validation-icon invalid">✗</span>}
                            </div>
                            {validationErrors.username && touched.username && (
                                <div className="field-error">{validationErrors.username}</div>
                            )}
                        </div>
                    )}

                    <div className={`form-group ${getFieldStatus('email')}`}>
                        <label htmlFor="email">Email</label>
                        <div className="input-wrapper">
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                required
                                placeholder="Enter your email"
                            />
                            {getFieldStatus('email') === 'valid' && <span className="validation-icon valid">✓</span>}
                            {getFieldStatus('email') === 'invalid' && <span className="validation-icon invalid">✗</span>}
                        </div>
                        {validationErrors.email && touched.email && (
                            <div className="field-error">{validationErrors.email}</div>
                        )}
                    </div>

                    <div className={`form-group password-group ${getFieldStatus('password')}`}>
                        <label htmlFor="password">Password</label>
                        <div className="password-input-container">
                            <input
                                type={passwordVisible ? 'text' : 'password'}
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                required
                                minLength="6"
                                placeholder="Enter your password"
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={togglePasswordVisibility}
                            >
                                {passwordVisible ? '👁️‍🗨️' : '👁️'}
                            </button>
                            {getFieldStatus('password') === 'valid' && <span className="validation-icon valid password-valid">✓</span>}
                        </div>
                        {validationErrors.password && touched.password && (
                            <div className="field-error">{validationErrors.password}</div>
                        )}
                        {isLogin && (
                            <div className="forgot-password">
                                <a href="#reset-password">Forgot password?</a>
                            </div>
                        )}
                    </div>

                    {!isLogin && (
                        <div className={`form-group password-group ${getFieldStatus('confirmPassword')}`}>
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <div className="password-input-container">
                                <input
                                    type={passwordVisible ? 'text' : 'password'}
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    required={!isLogin}
                                    minLength="6"
                                    placeholder="Confirm your password"
                                />
                                {getFieldStatus('confirmPassword') === 'valid' && <span className="validation-icon valid password-valid">✓</span>}
                            </div>
                            {validationErrors.confirmPassword && touched.confirmPassword && (
                                <div className="field-error">{validationErrors.confirmPassword}</div>
                            )}
                        </div>
                    )}

                    <button type="submit" disabled={loading}>
                        {loading && <span className="loading-indicator"></span>}
                        {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="toggle-form">
                    <p>
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            type="button"
                            className="link-button"
                            onClick={() => setIsLogin(!isLogin)}
                        >
                            {isLogin ? 'Register' : 'Sign In'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Login; 