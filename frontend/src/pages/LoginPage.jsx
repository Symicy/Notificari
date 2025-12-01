import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    Box, Card, CardContent, TextField, Button, Typography,
    Tabs, Tab, Alert, CircularProgress
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

function LoginPage() {
    const { login, register } = useAuth();
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    const [loginData, setLoginData] = useState({ username: '', password: '' });
    const [registerData, setRegisterData] = useState({ username: '', email: '', password: '', confirmPassword: '' });

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(loginData.username, loginData.password);
        } catch (err) {
            setError(err.response?.data?.error || 'Eroare la autentificare');
        }
        setLoading(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        
        if (registerData.password !== registerData.confirmPassword) {
            setError('Parolele nu coincid');
            return;
        }
        
        setLoading(true);
        try {
            await register(registerData.username, registerData.email, registerData.password);
        } catch (err) {
            setError(err.response?.data?.error || 'Eroare la înregistrare');
        }
        setLoading(false);
    };

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            bgcolor: '#f0f2f5'
        }}>
            <Card sx={{ maxWidth: 400, width: '100%', m: 2 }}>
                <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                        <Box sx={{ 
                            bgcolor: 'primary.main', 
                            borderRadius: '50%', 
                            p: 1, 
                            mb: 1 
                        }}>
                            <LockOutlinedIcon sx={{ color: 'white' }} />
                        </Box>
                        <Typography variant="h5">Licitații Live</Typography>
                    </Box>

                    <Tabs value={tab} onChange={(e, v) => { setTab(v); setError(''); }} centered sx={{ mb: 3 }}>
                        <Tab label="Autentificare" />
                        <Tab label="Înregistrare" />
                    </Tabs>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {tab === 0 ? (
                        <form onSubmit={handleLogin}>
                            <TextField
                                fullWidth
                                label="Username"
                                margin="normal"
                                value={loginData.username}
                                onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                                required
                            />
                            <TextField
                                fullWidth
                                label="Parolă"
                                type="password"
                                margin="normal"
                                value={loginData.password}
                                onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                                required
                            />
                            <Button 
                                type="submit" 
                                fullWidth 
                                variant="contained" 
                                sx={{ mt: 3 }}
                                disabled={loading}
                            >
                                {loading ? <CircularProgress size={24} /> : 'Conectare'}
                            </Button>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                                Admin: admin / admin123
                            </Typography>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister}>
                            <TextField
                                fullWidth
                                label="Username"
                                margin="normal"
                                value={registerData.username}
                                onChange={(e) => setRegisterData({...registerData, username: e.target.value})}
                                required
                            />
                            <TextField
                                fullWidth
                                label="Email"
                                type="email"
                                margin="normal"
                                value={registerData.email}
                                onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                                required
                            />
                            <TextField
                                fullWidth
                                label="Parolă"
                                type="password"
                                margin="normal"
                                value={registerData.password}
                                onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                                required
                            />
                            <TextField
                                fullWidth
                                label="Confirmă Parola"
                                type="password"
                                margin="normal"
                                value={registerData.confirmPassword}
                                onChange={(e) => setRegisterData({...registerData, confirmPassword: e.target.value})}
                                required
                            />
                            <Button 
                                type="submit" 
                                fullWidth 
                                variant="contained" 
                                sx={{ mt: 3 }}
                                disabled={loading}
                            >
                                {loading ? <CircularProgress size={24} /> : 'Înregistrare'}
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}

export default LoginPage;
