import express from 'express';
import { createClient } from "@supabase/supabase-js";
import jwt from 'jsonwebtoken';
import { synchronizeMatchesData } from '../sync.js';

const app = express();
app.use(express.json());

// Environment variables
const ADMIN_PANEL_PASSKEY = process.env.ADMIN_PANEL_PASSKEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET; // Add a new secret for JWT in Vercel

// Supabase client
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// CORS Middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

// --- Authentication ---

// 1. Login Endpoint
app.post('/api/login', (req, res) => {
    const { passkey } = req.body;
    if (passkey === ADMIN_PANEL_PASSKEY) {
        const token = jwt.sign({ authorized: true }, JWT_SECRET, { expiresIn: '8h' });
        return res.status(200).json({ token });
    }
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
});

// 2. Token Verification Middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

    if (!token) return res.status(401).json({ error: 'Access denied.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token is not valid.' });
        req.user = user;
        next();
    });
};


// --- API Routes ---

// GET /api/matches - Implements the "Sync if Stale" logic
app.get('/api/matches', verifyToken, async (req, res) => {
    try {
        const SYNC_INTERVAL_HOURS = 3;
        const { data: meta, error: metaError } = await supabaseAdmin.from('sync_metadata').select('last_successful_sync').eq('id', 1).single();
        if (metaError) throw metaError;

        const now = new Date();
        const lastSync = meta.last_successful_sync ? new Date(meta.last_successful_sync) : null;
        const hoursDiff = lastSync ? (now - lastSync) / (1000 * 60 * 60) : Infinity;

        if (hoursDiff > SYNC_INTERVAL_HOURS) {
            console.log(`Data is stale (last sync ${hoursDiff.toFixed(2)} hours ago). Triggering sync...`);
            await synchronizeMatchesData();
        }

        const { data, error } = await supabaseAdmin.from('matches').select('*').order('kickoffTime', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) {
        console.error('Error fetching matches:', e.message);
        res.status(500).json({ error: "Internal Server Error while fetching matches." });
    }
});

// GET /api/channels
app.get('/api/channels', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('channels').select('*').order('name', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) {
        console.error('Error fetching channels:', e.message);
        res.status(500).json({ error: "Internal Server Error while fetching channels." });
    }
});

// POST /api/channels
app.post('/api/channels', verifyToken, async (req, res) => {
    try {
        const { name, category, logo, urls } = req.body;
        if (!name || !category || !logo || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: "Invalid channel data." });
        }
        const { data, error } = await supabaseAdmin.from('channels').insert([{ name, category, logo, urls }]).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (e) {
        console.error('Error adding channel:', e.message);
        res.status(500).json({ error: "Internal Server Error." });
    }
});

// PUT /api/channels/:id - New endpoint to edit a channel
app.put('/api/channels/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, logo, urls } = req.body;
        if (!name || !category || !logo || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: "Invalid channel data." });
        }
        const { data, error } = await supabaseAdmin.from('channels').update({ name, category, logo, urls }).eq('id', id).select().single();
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) {
        console.error('Error updating channel:', e.message);
        res.status(500).json({ error: "Internal Server Error." });
    }
});


// DELETE /api/channels/:id
app.delete('/api/channels/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabaseAdmin.from('channels').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ message: "Channel deleted successfully." });
    } catch (e) {
        console.error('Error deleting channel:', e.message);
        res.status(500).json({ error: "Internal Server Error." });
    }
});

// POST /api/link
app.post('/api/link', verifyToken, async (req, res) => {
    try {
        const { matchId, channelIds } = req.body;
        const { data, error } = await supabaseAdmin.from('matches').update({ broadcastChannels: channelIds }).eq('matchId', matchId).select().single();
        if (error) throw error;
        res.status(200).json({ message: "Channels linked successfully.", data });
    } catch (e) {
        console.error('Error linking channels:', e.message);
        res.status(500).json({ error: "Internal Server Error." });
    }
});


// POST /api/sync - Manual sync
app.post('/api/sync', verifyToken, async (req, res) => {
    try {
        const result = await synchronizeMatchesData();
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (e) {
        console.error('Sync process failed:', e.message);
        res.status(500).json({ error: "An internal server error occurred during sync." });
    }
});

// Serve static files
app.use(express.static('public'));

export default app;
