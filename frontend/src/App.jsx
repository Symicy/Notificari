import React, { useEffect, useState, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { 
    AppBar, Toolbar, Typography, Container, Grid, Card, CardContent, 
    Button, TextField, Chip, Snackbar, Alert, Box, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, Avatar, Menu, MenuItem,
    Divider, LinearProgress, Tooltip, Tabs, Tab, Badge
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import AllInboxIcon from '@mui/icons-material/AllInbox';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';

const socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });

function AuctionApp() {
    const { user, logout, isAdmin, loading: authLoading } = useAuth();
    const [auctions, setAuctions] = useState([]);
    const [bidAmounts, setBidAmounts] = useState({});
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(0); // 0 = active, 1 = licitațiile mele, 2 = câștigate, 3 = finalizate
    const [serverTime, setServerTime] = useState(Date.now()); // Timpul primit de la server
    
    // State pentru modal adăugare
    const [openAddModal, setOpenAddModal] = useState(false);
    const [newItem, setNewItem] = useState({ title: '', startPrice: '', durationHours: '24' });
    
    // Menu utilizator
    const [anchorEl, setAnchorEl] = useState(null);

    // Primește timpul de la server prin WebSocket - toți clienții primesc același timp
    useEffect(() => {
        socket.on('server_time', (data) => {
            setServerTime(data.serverTime);
        });
        return () => socket.off('server_time');
    }, []);

    // Funcție pentru a verifica dacă o licitație este expirată (folosește timpul serverului)
    const isExpired = useCallback((endTime) => {
        return new Date(endTime).getTime() <= serverTime;
    }, [serverTime]);

    // Filtrare licitații
    const activeAuctions = useMemo(() => 
        auctions.filter(auc => !isExpired(auc.endTime)), 
        [auctions, isExpired]
    );
    
    const finishedAuctions = useMemo(() => 
        auctions.filter(auc => isExpired(auc.endTime)), 
        [auctions, isExpired]
    );

    // Licitațiile la care am participat (am licitat cel puțin o dată) - doar cele active
    const myBids = useMemo(() => 
        activeAuctions.filter(auc => auc.bidders?.includes(user?.username)), 
        [activeAuctions, user?.username]
    );

    // Licitațiile câștigate de utilizator
    const wonAuctions = useMemo(() => 
        finishedAuctions.filter(auc => auc.highestBidder === user?.username), 
        [finishedAuctions, user?.username]
    );

    // Încărcare date
    const loadData = async () => {
        try {
            const res = await axios.get('/api/auctions');
            setAuctions(Array.isArray(res.data) ? res.data : []);
        } catch (e) { 
            console.error(e);
            setAuctions([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (user) {
            loadData();
            
            // Actualizare preț
            socket.on('price_update', (data) => {
                setAuctions(prev => prev.map(auc => 
                    auc._id === data.auctionId 
                        ? {...auc, currentPrice: data.amount, highestBidder: data.bidder, bidders: data.bidders || auc.bidders } 
                        : auc
                ));
                setNotification({ 
                    open: true, 
                    message: `${data.bidder} a licitat $${data.amount}!`, 
                    severity: 'info' 
                });
            });

            // Licitație nouă creată
            socket.on('auction_created', (auction) => {
                setAuctions(prev => {
                    // Verifică dacă licitația există deja (evită duplicate)
                    if (prev.some(a => a._id === auction._id)) {
                        return prev;
                    }
                    return [auction, ...prev];
                });
                setNotification({ 
                    open: true, 
                    message: `Licitație nouă: ${auction.title}!`, 
                    severity: 'success' 
                });
            });

            // Licitație ștearsă
            socket.on('auction_deleted', (auctionId) => {
                setAuctions(prev => prev.filter(auc => auc._id !== auctionId));
                setNotification({ 
                    open: true, 
                    message: 'O licitație a fost ștearsă', 
                    severity: 'warning' 
                });
            });

            return () => {
                socket.off('price_update');
                socket.off('auction_created');
                socket.off('auction_deleted');
            };
        }
    }, [user]);

    const handleBid = async (auctionId) => {
        const amount = Number(bidAmounts[auctionId]);
        if (!amount) {
            setNotification({ open: true, message: "Introdu o sumă validă", severity: 'warning' });
            return;
        }
        try {
            await axios.post(`/api/auctions/${auctionId}/bid`, { amount });
            setNotification({ open: true, message: "Ofertă trimisă cu succes!", severity: 'success' });
            setBidAmounts({...bidAmounts, [auctionId]: ''});
            loadData();
        } catch (err) {
            const errorMsg = err.response?.data?.error || "Eroare la licitare";
            setNotification({ open: true, message: errorMsg, severity: 'error' });
        }
    };

    const handleCreateAuction = async () => {
        if (!newItem.title || !newItem.startPrice) {
            setNotification({ open: true, message: "Completează toate câmpurile", severity: 'warning' });
            return;
        }
        const hours = Number(newItem.durationHours) || 24;
        const endTime = new Date(Date.now() + hours * 60 * 60 * 1000);
        try {
            await axios.post('/api/auctions', {
                title: newItem.title,
                startPrice: Number(newItem.startPrice),
                endTime: endTime
            });
            setOpenAddModal(false);
            setNewItem({ title: '', startPrice: '', durationHours: '24' });
            // Nu apelăm loadData() - Socket.io va actualiza lista automat
            setNotification({ open: true, message: "Licitație creată!", severity: 'success' });
        } catch (err) {
            setNotification({ open: true, message: err.response?.data?.error || "Eroare la creare", severity: 'error' });
        }
    };

    const handleDeleteAuction = async (id) => {
        if (!window.confirm('Sigur vrei să ștergi această licitație?')) return;
        try {
            await axios.delete(`/api/auctions/${id}`);
            loadData();
            setNotification({ open: true, message: "Licitație ștearsă!", severity: 'success' });
        } catch (err) {
            setNotification({ open: true, message: "Eroare la ștergere", severity: 'error' });
        }
    };

    const getTimeRemaining = (endTime) => {
        const diff = new Date(endTime).getTime() - serverTime;
        if (diff <= 0) return 'Expirată';
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    };

    // Funcție pentru a obține lista de licitații în funcție de tab
    const getAuctionsForTab = () => {
        switch (activeTab) {
            case 0: return activeAuctions;
            case 1: return myBids;
            case 2: return wonAuctions;
            case 3: return finishedAuctions;
            default: return activeAuctions;
        }
    };

    const getEmptyMessage = () => {
        switch (activeTab) {
            case 0: return 'Nu există licitații active';
            case 1: return 'Nu ai licitat încă la nicio licitație activă';
            case 2: return 'Nu ai câștigat încă nicio licitație';
            case 3: return 'Nu există licitații finalizate';
            default: return 'Nu există licitații';
        }
    };

    if (authLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <LinearProgress sx={{ width: 200 }} />
            </Box>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    return (
        <Box sx={{ flexGrow: 1, bgcolor: '#f0f2f5', minHeight: '100vh' }}>
            <AppBar position="static" elevation={2}>
                <Toolbar>
                    <GavelIcon sx={{ mr: 2 }} /> 
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Licitații Live
                    </Typography>
                    
                    {isAdmin && (
                        <Button 
                            color="inherit" 
                            startIcon={<AddIcon />} 
                            onClick={() => setOpenAddModal(true)}
                            sx={{ mr: 2 }}
                        >
                            Adaugă Licitație
                        </Button>
                    )}
                    
                    <IconButton 
                        color="inherit" 
                        onClick={(e) => setAnchorEl(e.currentTarget)}
                    >
                        <Avatar sx={{ bgcolor: isAdmin ? 'secondary.main' : 'primary.dark', width: 35, height: 35 }}>
                            {user.username[0].toUpperCase()}
                        </Avatar>
                    </IconButton>
                    
                    <Menu
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl)}
                        onClose={() => setAnchorEl(null)}
                    >
                        <MenuItem disabled>
                            <PersonIcon sx={{ mr: 1 }} />
                            {user.username}
                            {isAdmin && (
                                <Chip 
                                    size="small" 
                                    label="Admin" 
                                    color="secondary" 
                                    sx={{ ml: 1 }} 
                                    icon={<AdminPanelSettingsIcon />}
                                />
                            )}
                        </MenuItem>
                        <Divider />
                        <MenuItem onClick={() => { logout(); setAnchorEl(null); }}>
                            <LogoutIcon sx={{ mr: 1 }} />
                            Deconectare
                        </MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>

            <Container sx={{ mt: 4, pb: 4 }}>
                {/* Tabs pentru navigare */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
                        <Tab 
                            icon={<AllInboxIcon />} 
                            iconPosition="start" 
                            label={`Active (${activeAuctions.length})`}
                        />
                        <Tab 
                            icon={
                                <Badge badgeContent={myBids.length} color="primary">
                                    <LocalOfferIcon />
                                </Badge>
                            } 
                            iconPosition="start" 
                            label="Licitațiile Mele" 
                        />
                        <Tab 
                            icon={
                                <Badge badgeContent={wonAuctions.length} color="success">
                                    <EmojiEventsIcon />
                                </Badge>
                            } 
                            iconPosition="start" 
                            label="Câștigate" 
                        />
                        <Tab 
                            icon={
                                <Badge badgeContent={finishedAuctions.length} color="default">
                                    <DoneAllIcon />
                                </Badge>
                            } 
                            iconPosition="start" 
                            label="Finalizate" 
                        />
                    </Tabs>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <LinearProgress sx={{ width: 200 }} />
                    </Box>
                ) : getAuctionsForTab().length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <GavelIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                        <Typography variant="h5" color="text.secondary">
                            {getEmptyMessage()}
                        </Typography>
                        {isAdmin && activeTab === 0 && (
                            <Button 
                                variant="contained" 
                                startIcon={<AddIcon />}
                                onClick={() => setOpenAddModal(true)}
                                sx={{ mt: 2 }}
                            >
                                Creează prima licitație
                            </Button>
                        )}
                        {(activeTab === 1 || activeTab === 2 || activeTab === 3) && (
                            <Button 
                                variant="outlined" 
                                onClick={() => setActiveTab(0)}
                                sx={{ mt: 2 }}
                            >
                                Vezi licitațiile active
                            </Button>
                        )}
                    </Box>
                ) : (
                    <Grid container spacing={3}>
                        {getAuctionsForTab().map((auc) => {
                            const expired = isExpired(auc.endTime);
                            const isWinner = expired && auc.highestBidder === user?.username;
                            const isLeading = !expired && auc.highestBidder === user?.username;
                            
                            return (
                            <Grid item xs={12} sm={6} md={4} key={auc._id}>
                                <Card 
                                    elevation={3} 
                                    sx={{ 
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        transition: 'transform 0.2s',
                                        '&:hover': { transform: 'translateY(-4px)' },
                                        border: isWinner 
                                            ? '2px solid #ffc107' 
                                            : isLeading 
                                                ? '2px solid #4caf50' 
                                                : 'none',
                                        opacity: expired && !isWinner ? 0.8 : 1,
                                        bgcolor: expired ? '#f5f5f5' : 'white'
                                    }}
                                >
                                    <CardContent sx={{ flexGrow: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="h5" gutterBottom>
                                                    {auc.title}
                                                </Typography>
                                                {isWinner && (
                                                    <EmojiEventsIcon sx={{ color: '#ffc107', fontSize: 28 }} />
                                                )}
                                            </Box>
                                            {isAdmin && (
                                                <Tooltip title="Șterge licitația">
                                                    <IconButton 
                                                        size="small" 
                                                        color="error"
                                                        onClick={() => handleDeleteAuction(auc._id)}
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Box>
                                        
                                        <Typography variant="h3" color={expired ? 'text.secondary' : 'primary'} sx={{ my: 2, fontWeight: 'bold' }}>
                                            ${auc.currentPrice}
                                        </Typography>
                                        
                                        <Box sx={{ mb: 2 }}>
                                            <Chip 
                                                icon={isWinner ? <EmojiEventsIcon /> : <PersonIcon />}
                                                label={
                                                    isWinner 
                                                        ? 'Ai câștigat!' 
                                                        : auc.highestBidder 
                                                            ? `${expired ? 'Câștigător' : 'Lider'}: ${auc.highestBidder}` 
                                                            : 'Fără oferte'
                                                }
                                                color={isWinner ? 'warning' : isLeading ? 'success' : 'default'}
                                                variant={isWinner ? 'filled' : 'outlined'}
                                                sx={{ mr: 1, mb: 1 }}
                                            />
                                            <Chip 
                                                icon={<AccessTimeIcon />}
                                                label={getTimeRemaining(auc.endTime)}
                                                color={expired ? 'error' : 'warning'}
                                                variant={expired ? 'filled' : 'outlined'}
                                                sx={{ mb: 1 }}
                                            />
                                        </Box>
                                        
                                        <Divider sx={{ my: 2 }} />
                                        
                                        {expired ? (
                                            <Box sx={{ textAlign: 'center', py: 1 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    {auc.highestBidder 
                                                        ? isWinner 
                                                            ? '🎉 Felicitări! Ai câștigat această licitație!' 
                                                            : `Licitație finalizată - Câștigător: ${auc.highestBidder}`
                                                        : 'Licitație finalizată fără oferte'
                                                    }
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <TextField 
                                                    label="Suma ta" 
                                                    type="number" 
                                                    size="small"
                                                    fullWidth
                                                    value={bidAmounts[auc._id] || ''}
                                                    onChange={(e) => setBidAmounts({...bidAmounts, [auc._id]: e.target.value})}
                                                    placeholder={`Min: $${auc.currentPrice + 1}`}
                                                />
                                                <Button 
                                                    variant="contained" 
                                                    onClick={() => handleBid(auc._id)}
                                                    sx={{ minWidth: 100 }}
                                                >
                                                    Licitează
                                                </Button>
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        )})}
                    </Grid>
                )}
            </Container>

            {/* Modal Adăugare Licitație */}
            <Dialog open={openAddModal} onClose={() => setOpenAddModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AddIcon color="primary" />
                        Creează Licitație Nouă
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <TextField 
                        autoFocus 
                        margin="dense" 
                        label="Titlu Produs" 
                        fullWidth 
                        variant="outlined"
                        value={newItem.title}
                        onChange={(e) => setNewItem({...newItem, title: e.target.value})} 
                    />
                    <TextField 
                        margin="dense" 
                        label="Preț de Start ($)" 
                        type="number" 
                        fullWidth 
                        variant="outlined"
                        value={newItem.startPrice}
                        onChange={(e) => setNewItem({...newItem, startPrice: e.target.value})} 
                    />
                    <TextField 
                        margin="dense" 
                        label="Durată (ore)" 
                        type="number" 
                        fullWidth 
                        variant="outlined"
                        value={newItem.durationHours}
                        onChange={(e) => setNewItem({...newItem, durationHours: e.target.value})}
                        helperText="Licitația va expira după acest număr de ore"
                        inputProps={{ min: 1, max: 720 }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenAddModal(false)}>Anulează</Button>
                    <Button onClick={handleCreateAuction} variant="contained" startIcon={<AddIcon />}>
                        Creează
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar 
                open={notification.open} 
                autoHideDuration={4000} 
                onClose={() => setNotification({...notification, open: false})}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert 
                    severity={notification.severity} 
                    variant="filled"
                    onClose={() => setNotification({...notification, open: false})}
                >
                    {notification.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

function App() {
    return (
        <AuthProvider>
            <AuctionApp />
        </AuthProvider>
    );
}

export default App;