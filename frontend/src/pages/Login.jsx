import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import logoMitIndia from '../assets/logo_mitindia.jpg';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [validationError, setValidationError] = useState('');

  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleTogglePassword = () => {
    setShowPassword((prev) => !prev);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    // Client-side validations
    if (!username.trim() || !password.trim()) {
      setValidationError('Username and password are required');
      return;
    }

    setInFlight(true);
    const result = await login(username.trim(), password);
    setInFlight(false);

    if (result.success) {
      addToast('Logged in successfully!', 'success');
      // Redirect based on role in auth context
      // Note: We'll read the role directly from the result or context.
      // We will perform navigation in App.jsx or route dynamically here.
      // Let's redirect to `/` which will dynamically render based on role.
      navigate('/');
    } else {
      addToast(result.error, 'error');
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="glass-card" style={{ width: '100%', maxWidth: '420px', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img 
            src={logoMitIndia} 
            alt="MIT India Hackathon Logo" 
            style={{ height: '70px', objectFit: 'contain', marginBottom: '16px', borderRadius: '4px' }}
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Sign in to access your dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <div className="input-container">
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
                <User size={18} />
              </span>
              <input
                id="username"
                type="text"
                className="form-input"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={inFlight}
                style={{ paddingLeft: '44px' }}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <div className="input-container">
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
                <Lock size={18} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={inFlight}
                style={{ paddingLeft: '44px', paddingRight: '48px' }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={handleTogglePassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="pw-toggle"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {/* Reserved space to prevent layout shifting on errors */}
            <div className="validation-error-space">
              {validationError && <span>{validationError}</span>}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={inFlight}
          >
            {inFlight ? (
              <>
                <span className="spinner"></span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
