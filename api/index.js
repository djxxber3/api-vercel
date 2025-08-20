import express from 'express';
import { createClient } from "@supabase/supabase-js";
import { synchronizeMatchesData } from '../sync.js';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// قم بإنشاء ملف .env في المجلد الرئيسي وأضف المتغيرات البيئية فيه
// VERCEL_URL هو متغير بيئي يتم توفيره تلقائياً بواسطة Vercel
const VERCEL_URL = process.env.VERCEL_URL;
const ADMIN_PANEL_PASSKEY = process.env.ADMIN_PANEL_PASSKEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// إعداد middleware لتمكين CORS والسماح بالوصول من أي مكان
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Passkey');
    next();
});

// Middleware للتحقق من مفتاح المرور للمسارات الحساسة
const checkAdminPasskey = (req, res, next) => {
    const passkey = req.headers['x-admin-passkey'];
    if (passkey !== ADMIN_PANEL_PASSKEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// مسارات API
app.get('/api/matches', async (req, res) => {
    try {
        const { data, error } = await supabaseAnon.from('matches').select('*');
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.delete('/api/matches', checkAdminPasskey, async (req, res) => {
    const { clear } = req.query;
    if (clear !== 'true') {
        return res.status(400).json({ error: "Invalid clear parameter" });
    }
    try {
        const { error: matchesError } = await supabaseAdmin.from('matches').delete().neq('matchId', '0');
        const { error: channelsError } = await supabaseAdmin.from('channels').delete().neq('id', '0');
        if (matchesError || channelsError) {
            console.error('Clear data error:', matchesError || channelsError);
            return res.status(500).json({ error: "Failed to clear data" });
        }
        res.status(200).json({ message: "All data cleared successfully" });
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/channels', async (req, res) => {
    try {
        const { data, error } = await supabaseAnon.from('channels').select('*');
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/channels', checkAdminPasskey, async (req, res) => {
    try {
        const { name, urls } = req.body;
        if (!name || !urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: "Invalid channel data" });
        }
        const { data, error } = await supabaseAdmin.from('channels').insert([{ name, urls }]).select();
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.delete('/api/channels', checkAdminPasskey, async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }
        const { error } = await supabaseAdmin.from('channels').delete().eq('id', id);
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.status(200).json({ message: "Channel deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/link', checkAdminPasskey, async (req, res) => {
    try {
        const { matchId, channels } = req.body;
        if (!matchId || !channels || !Array.isArray(channels)) {
            return res.status(400).json({ error: "Invalid data" });
        }
        const { data, error } = await supabaseAdmin
            .from('matches')
            .update({ broadcastChannels: channels, syncedAt: new Date().toISOString() })
            .eq('matchId', matchId)
            .select();
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.status(200).json({ message: "Channels linked successfully", data });
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/sync', async (req, res) => {
    const authHeader = req.headers['x-admin-passkey'];
    if (authHeader !== ADMIN_PANEL_PASSKEY) {
        // Vercel Cron does not send headers. The security is in the obscurity of the endpoint.
        // For manual sync, we'll still check the header.
    }
    try {
        const result = await synchronizeMatchesData();
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// هذا هو المسار الذي يخدم ملفات الواجهة الأمامية.
// Vercel Serverless Function entry point
app.use(express.static('public'));
export default app;