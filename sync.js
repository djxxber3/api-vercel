import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CONFIG = {
    SUPPORTED_LEAGUES: [39, 61, 140, 78, 135, 94, 5, 2, 3, 531, 308, 54, 307, 826, 186, 514, 516, 202, 511, 714, 895, 233, 539, 200, 201, 822, 6, 36, 538, 953, 19, 1163, 29, 934, 768, 860, 807, 1132, 17, 18, 24, 1129, 7, 35, 12, 20, 533],
    API_BASE_URL: 'https://v3.football.api-sports.io',
    REQUEST_TIMEOUT: 25000,
    RATE_LIMIT_DELAY: 600,
    MAX_RETRIES: 3
};

// ... (Helper functions like delay, makeApiRequest, transformFixtureData remain the same)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const makeApiRequest = async (url, retryCount = 0) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        const response = await fetch(url, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        if (data.errors && Object.keys(data.errors).length > 0) {
            console.warn(`API returned errors:`, data.errors);
        }
        return data.response || [];
    } catch (error) {
        if (retryCount < CONFIG.MAX_RETRIES - 1) {
            const backoff = CONFIG.RATE_LIMIT_DELAY * Math.pow(2, retryCount);
            await delay(backoff);
            return makeApiRequest(url, retryCount + 1);
        }
        console.error(`Failed API request to ${url} after ${CONFIG.MAX_RETRIES} retries.`, error);
        throw error;
    }
};

const transformFixtureData = (fixture) => {
    try {
        const { fixture: { id, date, status }, teams: { home, away }, goals, league } = fixture;
        if (!id || !date || !home?.name || !away?.name || !league?.name) return null;
        return {
            matchId: id.toString(), externalId: id, kickoffTime: date,
            matchDate: new Date(date).toISOString().slice(0, 10),
            status: status.short || 'NS', statusText: status.long || 'Not Started',
            homeTeam: { name: home.name, logo: home.logo, goals: goals.home },
            awayTeam: { name: away.name, logo: away.logo, goals: goals.away },
            competition: { name: league.name, logo: league.logo, country: league.country },
            broadcastChannels: [], lastUpdated: new Date().toISOString(), syncedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error(`Failed to transform fixture ID ${fixture?.fixture?.id}:`, error);
        return null;
    }
};

const fetchMatchesByDate = async (date) => {
    const url = `${CONFIG.API_BASE_URL}/fixtures?date=${date}`;
    const fixtures = await makeApiRequest(url);
    if (!Array.isArray(fixtures)) return [];
    
    return fixtures
        .filter(f => f?.league?.id && CONFIG.SUPPORTED_LEAGUES.includes(f.league.id))
        .map(transformFixtureData)
        .filter(Boolean);
};


export const synchronizeMatchesData = async () => {
    const startTime = Date.now();
    const today = new Date();
    const dates = [
        new Date(new Date().setDate(today.getDate() - 1)).toISOString().slice(0, 10),
        new Date().toISOString().slice(0, 10),
        new Date(new Date().setDate(today.getDate() + 1)).toISOString().slice(0, 10)
    ];

    try {
        const results = await Promise.all(dates.map(date => fetchMatchesByDate(date)));
        const allNewMatches = results.flat();

        if (allNewMatches.length === 0) {
            return { success: true, message: 'Sync complete. No new matches found.' };
        }

        const { data: existingMatches, error: fetchError } = await supabase.from('matches').select('matchId, broadcastChannels');
        if (fetchError) throw fetchError;
        
        const existingMap = new Map(existingMatches.map(m => [m.matchId, m]));

        const matchesToUpsert = allNewMatches.map(newMatch => ({
            ...newMatch,
            broadcastChannels: existingMap.get(newMatch.matchId)?.broadcastChannels || [],
            lastUpdated: new Date().toISOString()
        }));

        const { error: upsertError } = await supabase.from('matches').upsert(matchesToUpsert, { onConflict: 'matchId' });
        if (upsertError) throw upsertError;
        
        // *** NEW: Update sync metadata on successful sync ***
        const { error: metaError } = await supabase.from('sync_metadata').update({ last_successful_sync: new Date().toISOString() }).eq('id', 1);
        if (metaError) console.error("Failed to update sync timestamp:", metaError);
        
        const duration = Date.now() - startTime;
        return {
            success: true,
            message: `Successfully synced ${matchesToUpsert.length} matches in ${duration}ms.`,
            stats: { updated: matchesToUpsert.length, duration }
        };

    } catch (error) {
        console.error('Sync process error:', error);
        return { success: false, message: 'Error during sync process.', error: error.message };
    }
};
