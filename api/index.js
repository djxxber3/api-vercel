import express from 'express';
import { createClient } from "@supabase/supabase-js";
import fetch from 'node-fetch';
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

// GET /api/channels/:id/urls - Get URLs with failover logic for video players
app.get('/api/channels/:id/urls', async (req, res) => {
    try {
        const { data: channel, error } = await supabaseAdmin
            .from('channels')
            .select('*')
            .eq('id', req.params.id)
            .single();
        
        if (error) return res.status(404).json({ error: 'Channel not found' });
        
        // Sort URLs by priority (if available) and health status
        const sortedUrls = (channel.urls || [])
            .map((url, index) => ({
                ...url,
                index,
                priority: url.priority || index, // Use index as default priority
                isHealthy: url.isHealthy !== false, // Default to healthy if not set
                lastChecked: url.lastChecked || null
            }))
            .sort((a, b) => {
                // Healthy URLs first, then by priority
                if (a.isHealthy !== b.isHealthy) return b.isHealthy - a.isHealthy;
                return a.priority - b.priority;
            });
        
        res.status(200).json({
            channelId: channel.id,
            channelName: channel.name,
            urls: sortedUrls
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/channels/:id/check-health - Check health status of channel URLs
app.post('/api/channels/:id/check-health', async (req, res) => {
    try {
        const { data: channel, error } = await supabaseAdmin
            .from('channels')
            .select('*')
            .eq('id', req.params.id)
            .single();
        
        if (error) return res.status(404).json({ error: 'Channel not found' });
        
        // Check each URL health (simplified version - in production you'd want more sophisticated checking)
        const updatedUrls = await Promise.all((channel.urls || []).map(async (url, index) => {
            try {
                // Simple HEAD request to check if URL is accessible
                const response = await fetch(url.url, { 
                    method: 'HEAD', 
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; HealthChecker/1.0)'
                    }
                });
                
                return {
                    ...url,
                    isHealthy: response.ok,
                    lastChecked: new Date().toISOString(),
                    statusCode: response.status
                };
            } catch (err) {
                return {
                    ...url,
                    isHealthy: false,
                    lastChecked: new Date().toISOString(),
                    error: err.message
                };
            }
        }));
        
        // Update channel with health status
        const { data: updatedChannel, error: updateError } = await supabaseAdmin
            .from('channels')
            .update({ urls: updatedUrls })
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (updateError) throw updateError;
        
        res.status(200).json({
            message: 'Health check completed',
            channel: updatedChannel,
            healthySummary: {
                total: updatedUrls.length,
                healthy: updatedUrls.filter(u => u.isHealthy).length,
                unhealthy: updatedUrls.filter(u => !u.isHealthy).length
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/channels/:id/report-failure - Report URL failure from video player
app.post('/api/channels/:id/report-failure', async (req, res) => {
    try {
        const { urlIndex, error: urlError } = req.body;
        
        const { data: channel, error } = await supabaseAdmin
            .from('channels')
            .select('*')
            .eq('id', req.params.id)
            .single();
        
        if (error) return res.status(404).json({ error: 'Channel not found' });
        
        if (!channel.urls || !channel.urls[urlIndex]) {
            return res.status(400).json({ error: 'Invalid URL index' });
        }
        
        // Mark URL as unhealthy
        const updatedUrls = [...channel.urls];
        updatedUrls[urlIndex] = {
            ...updatedUrls[urlIndex],
            isHealthy: false,
            lastChecked: new Date().toISOString(),
            lastError: urlError || 'Player reported failure'
        };
        
        // Update channel
        const { data: updatedChannel, error: updateError } = await supabaseAdmin
            .from('channels')
            .update({ urls: updatedUrls })
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (updateError) throw updateError;
        
        // Return next available healthy URL
        const nextHealthyUrl = updatedUrls.find((url, idx) => 
            idx !== urlIndex && url.isHealthy !== false
        );
        
        res.status(200).json({
            message: 'Failure reported and URL marked as unhealthy',
            nextUrl: nextHealthyUrl || null,
            remainingHealthyUrls: updatedUrls.filter((url, idx) => 
                idx !== urlIndex && url.isHealthy !== false
            ).length
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Serve static files from 'public'
app.use(express.static('public'));

export default app;
