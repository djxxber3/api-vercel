import express from 'express';
import { createClient } from "@supabase/supabase-js";
import { synchronizeMatchesData } from '../sync.js';

const app = express();
app.use(express.json());

// Environment variables
const ADMIN_PANEL_PASSKEY = process.env.ADMIN_PANEL_PASSKEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase clients
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// CORS Middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Passkey');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Middleware to check for admin passkey
const checkAdminPasskey = (req, res, next) => {
    const passkey = req.headers['x-admin-passkey'];
    if (!passkey || passkey !== ADMIN_PANEL_PASSKEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing passkey.' });
    }
    next();
};

// --- API Routes ---

// GET /api/matches - Public route to get all matches
app.get('/api/matches', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('matches').select('*').order('kickoffTime', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) {
        console.error('Error fetching matches:', e.message);
        res.status(500).json({ error: "Internal Server Error while fetching matches." });
    }
});

// DELETE /api/matches - Admin route to clear all matches and channels
app.delete('/api/matches', checkAdminPasskey, async (req, res) => {
    try {
        const { error: matchesError } = await supabaseAdmin.from('matches').delete().neq('matchId', '0');
        if (matchesError) throw matchesError;
        
        const { error: channelsError } = await supabaseAdmin.from('channels').delete().neq('id', '0');
        if (channelsError) throw channelsError;

        res.status(200).json({ message: "All matches and channels cleared successfully." });
    } catch (e) {
        console.error('Clear data error:', e.message);
        res.status(500).json({ error: "Failed to clear data." });
    }
});

// GET /api/channels - Public route to get all channels
app.get('/api/channels', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('channels').select('*').order('name', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) {
        console.error('Error fetching channels:', e.message);
        res.status(500).json({ error: "Internal Server Error while fetching channels." });
    }
});

// POST /api/channels - Admin route to add a new channel
app.post('/api/channels', checkAdminPasskey, async (req, res) => {
    try {
        const { name, category, logo, urls } = req.body;
        if (!name || !category || !logo || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: "Invalid channel data. Name, category, logo, and at least one URL are required." });
        }
        const { data, error } = await supabaseAdmin.from('channels').insert([{ name, category, logo, urls }]).select();
        if (error) throw error;
        res.status(201).json(data[0]);
    } catch (e) {
        console.error('Error adding channel:', e.message);
        res.status(500).json({ error: "Internal Server Error while adding a channel." });
    }
});

// DELETE /api/channels/:id - Admin route to delete a channel
app.delete('/api/channels/:id', checkAdminPasskey, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Channel ID is required.' });
        }
        const { error } = await supabaseAdmin.from('channels').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ message: "Channel deleted successfully." });
    } catch (e) {
        console.error('Error deleting channel:', e.message);
        res.status(500).json({ error: "Internal Server Error while deleting a channel." });
    }
});

// POST /api/link - Admin route to link channels to a match
app.post('/api/link', checkAdminPasskey, async (req, res) => {
    try {
        const { matchId, channelIds } = req.body;
        if (!matchId || !Array.isArray(channelIds)) {
            return res.status(400).json({ error: "Invalid data. Match ID and an array of channel IDs are required." });
        }
        const { data, error } = await supabaseAdmin
            .from('matches')
            .update({ broadcastChannels: channelIds, syncedAt: new Date().toISOString() })
            .eq('matchId', matchId)
            .select();
        if (error) throw error;
        res.status(200).json({ message: "Channels linked successfully.", data: data[0] });
    } catch (e) {
        console.error('Error linking channels:', e.message);
        res.status(500).json({ error: "Internal Server Error while linking channels." });
    }
});

// POST /api/sync - Admin route to force a data sync
app.post('/api/sync', checkAdminPasskey, async (req, res) => {
    try {
        const result = await synchronizeMatchesData();
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (e) {
        console.error('Sync process failed:', e.message);
        res.status(500).json({ error: "An internal server error occurred during the sync process." });
    }
});

// Serve static files from 'public'
app.use(express.static('public'));

export default app;
