import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:5001';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('vg_token');
    if (!token) { setLoading(false); return; }
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setUser(u); else localStorage.removeItem('vg_token'); })
      .catch(() => localStorage.removeItem('vg_token'))
      .finally(() => setLoading(false));
  }, []);

  const saveSession = (token, userData) => {
    localStorage.setItem('vg_token', token);
    setUser(userData);
  };

  const register = useCallback(async (name, email, password) => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    saveSession(data.token, data.user);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    saveSession(data.token, data.user);
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const res = await fetch(`${API}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Google login failed');
    saveSession(data.token, data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('vg_token');
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser(prev => ({ ...prev, ...patch }));
  }, []);

  const token = localStorage.getItem('vg_token');

  return (
    <AuthContext.Provider value={{ user, loading, token, register, login, loginWithGoogle, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
