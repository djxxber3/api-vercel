import express from 'express';
import { createClient } from "@supabase/supabase-js";
import { synchronizeMatchesData } from '../sync.js';

const app = express();
app.use(express.json());

// --- Environment Variables ---
const ADMIN_PANEL_PASSKEY = process.env.ADMIN_PANEL_PASSKEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- Supabase Client ---
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- CORS Middleware ---
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Passkey');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

// --- Simple Authentication Middleware ---
const checkAdminPasskey = (req, res, next) => {
    const passkey = req.headers['x-admin-passkey'];
    if (passkey && passkey === ADMIN_PANEL_PASSKEY) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// --- API Routes ---

// A dedicated endpoint just for verifying the passkey on login
app.post('/api/verify-passkey', (req, res) => {
    const passkey = req.headers['x-admin-passkey'];
    if (passkey && passkey === ADMIN_PANEL_PASSKEY) {
        return res.status(200).json({ message: 'Passkey is valid.' });
    }
    res.status(401).json({ error: 'Unauthorized' });
});


// All other routes are protected by the middleware
app.use('/api', checkAdminPasskey);

// GET /api/matches (with efficient sync logic)
app.get('/api/matches', async (req, res) => {
    try {
        const SYNC_INTERVAL_HOURS = 3;
        const { data: meta } = await supabaseAdmin.from('sync_metadata').select('last_successful_sync').eq('id', 1).single();
        
        const now = new Date();
        const lastSync = meta?.last_successful_sync ? new Date(meta.last_successful_sync) : null;
        const hoursDiff = lastSync ? (now - lastSync) / 36e5 : Infinity;

        if (hoursDiff > SYNC_INTERVAL_HOURS) {
            console.log(`Sync needed. Last sync was ${hoursDiff.toFixed(1)} hours ago.`);
            await synchronizeMatchesData();
        }

        const { data, error } = await supabaseAdmin.from('matches').select('*').order('kickoffTime', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) {
        console.error('Error fetching matches:', e.message);
        res.status(500).json({ error: "Server error while fetching matches." });
    }
});

// GET /api/channels
app.get('/api/channels', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('channels').select('*').order('name', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/channels
app.post('/api/channels', async (req, res) => {
    const { data, error } = await supabaseAdmin.from('channels').insert([req.body]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

// PUT /api/channels/:id
app.put('/api/channels/:id', async (req, res) => {
    const { data, error } = await supabaseAdmin.from('channels').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

// DELETE /api/channels/:id
app.delete('/api/channels/:id', async (req, res) => {
    const { error } = await supabaseAdmin.from('channels').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json({ message: "Channel deleted." });
});

// POST /api/link
app.post('/api/link', async (req, res) => {
    const { matchId, channelIds } = req.body;
    const { data, error } = await supabaseAdmin.from('matches').update({ broadcastChannels: channelIds }).eq('matchId', matchId).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json({ message: "Channels linked.", data });
});

// POST /api/sync
app.post('/api/sync', async (req, res) => {
    const result = await synchronizeMatchesData();
    if (result.success) return res.status(200).json(result);
    res.status(500).json(result);
});

// Serve static files from 'public'
app.use(express.static('public'));

export default app;
