import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
    SUPABASE_URL, 
    SUPABASE_SERVICE_ROLE_KEY
);

// الإعدادات ووظائف المساعدة
const CONFIG = {
    SUPPORTED_LEAGUES: [39, 61, 140, 78, 135, 94, 5, 2, 3, 531, 308, 54, 307, 826, 186, 514, 516, 202, 511, 714, 895, 233, 539, 200, 201, 822, 6, 36, 538, 953, 19, 1163, 29, 934, 768, 860, 807, 1132, 17, 18, 24, 1129, 7, 35, 12, 20, 533], 
    API_BASE_URL: 'https://v3.football.api-sports.io',
    REQUEST_TIMEOUT: 25000,
    RATE_LIMIT_DELAY: 500,
    MAX_RETRIES: 3
};

const delayExecution = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};

const getDateRange = () => {
    const today = new Date();
    const dates = [];
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    dates.push(yesterday.toISOString().slice(0, 10));
    dates.push(today.toISOString().slice(0, 10));
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    dates.push(tomorrow.toISOString().slice(0, 10));
    return dates;
};

const makeApiRequest = async (url, retryCount = 0) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        const response = await fetch(url, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (data.errors && Object.keys(data.errors).length > 0) {
            throw new Error(`API Error: ${JSON.stringify(data.errors)}`);
        }
        return data.response || [];
    } catch (error) {
        if (retryCount < CONFIG.MAX_RETRIES - 1 && !error.name?.includes('Abort')) {
            const backoffDelay = CONFIG.RATE_LIMIT_DELAY * Math.pow(2, retryCount);
            await delayExecution(backoffDelay);
            return makeApiRequest(url, retryCount + 1);
        }
        throw error;
    }
};

const transformFixtureToMatch = (fixture) => {
    try {
        const {
            fixture: { 
                id, 
                date: matchDateTime, 
                status: { short: statusCode, long: statusDescription } = {}, 
                venue: { name: venueName, city: venueCity } = {},
                referee 
            } = {},
            teams: { home = {}, away = {} } = {},
            goals: { home: homeGoals, away: awayGoals } = {},
            league: { 
                name: leagueName, 
                logo: leagueLogo, 
                country: leagueCountry 
            } = {}
        } = fixture;
        if (!id || !matchDateTime || !home.name || !away.name) {
            throw new Error('Missing required fixture data');
        }
        return {
            matchId: id.toString(),
            externalId: id,
            kickoffTime: matchDateTime,
            matchDate: new Date(matchDateTime).toISOString().slice(0, 10),
            matchTime: new Date(matchDateTime).toLocaleTimeString('en-GB', { 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false 
            }),
            status: statusCode || 'NS',
            statusText: statusDescription || 'Not Started',
            isLive: ['1H', 'HT', '2H', 'ET', 'P'].includes(statusCode),
            isFinished: ['FT', 'AET', 'PEN'].includes(statusCode),
            isUpcoming: statusCode === 'NS',
            homeTeam: { 
                name: home.name || 'Unknown', 
                logo: home.logo || '', 
                goals: homeGoals 
            },
            awayTeam: { 
                name: away.name || 'Unknown', 
                logo: away.logo || '', 
                goals: awayGoals 
            },
            score: { 
                home: homeGoals, 
                away: awayGoals, 
                display: homeGoals !== null && awayGoals !== null ? 
                    `${homeGoals} - ${awayGoals}` : 'vs' 
            },
            venue: { 
                name: venueName || 'غير محدد', 
                city: venueCity || 'غير محدد' 
            },
            competition: { 
                name: leagueName || 'Unknown League', 
                logo: leagueLogo || '', 
                country: leagueCountry || 'Unknown' 
            },
            referee: referee || 'غير محدد',
            broadcastChannels: [],
            lastUpdated: new Date().toISOString(),
            syncedAt: new Date().toISOString()
        };
    } catch (error) {
        return null;
    }
};

const fetchMatchesForDate = async (dateString) => {
    try {
        const apiUrl = `${CONFIG.API_BASE_URL}/fixtures?date=${dateString}`;
        const fixtures = await makeApiRequest(apiUrl);
        if (!fixtures || !Array.isArray(fixtures)) {
            return [];
        }
        const filteredFixtures = fixtures.filter(fixture => {
            return fixture?.league?.id && 
                   CONFIG.SUPPORTED_LEAGUES.includes(fixture.league.id);
        });
        const transformedMatches = filteredFixtures
            .map(transformFixtureToMatch)
            .filter(match => match !== null);
        return transformedMatches;
    } catch (error) {
        return [];
    }
};

export const synchronizeMatchesData = async () => {
    const syncStartTime = Date.now();
    const dateRange = getDateRange();
    let totalProcessed = 0;
    let totalUpdated = 0;

    try {
        const allNewMatches = [];
        for (const dateString of dateRange) {
            try {
                const dayMatches = await fetchMatchesForDate(dateString);
                allNewMatches.push(...dayMatches);
                totalProcessed += dayMatches.length;
                if (dateString !== dateRange[dateRange.length - 1]) {
                    await delayExecution(CONFIG.RATE_LIMIT_DELAY);
                }
            } catch (error) {
                console.error(`Error processing date ${dateString}:`, error);
            }
        }

        if (allNewMatches.length === 0) {
            return { success: true, message: 'No matches to update', stats: { processed: 0, updated: 0, duration: Date.now() - syncStartTime } };
        }

        const { data: existingMatches, error: existingMatchesError } = await supabase.from('matches').select('matchId, broadcastChannels, createdAt');
        if (existingMatchesError) {
            throw existingMatchesError;
        }

        const existingMatchesMap = new Map();
        if (existingMatches) {
            existingMatches.forEach(match => {
                existingMatchesMap.set(match.matchId, match);
            });
        }

        const matchesToUpsert = allNewMatches.map(newMatch => {
            const existingMatch = existingMatchesMap.get(newMatch.matchId);
            return {
                ...newMatch,
                broadcastChannels: existingMatch?.broadcastChannels || [],
                createdAt: existingMatch?.createdAt || new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };
        });

        const { data, error } = await supabase
            .from('matches')
            .upsert(matchesToUpsert, { onConflict: 'matchId', ignoreDuplicates: false });
        if (error) {
            throw error;
        }

        totalUpdated = matchesToUpsert.length;
        const syncDuration = Date.now() - syncStartTime;
        const successMessage = `Successfully synced ${totalUpdated} matches (${totalProcessed} processed) in ${syncDuration}ms`;
        return {
            success: true,
            message: successMessage,
            stats: { processed: totalProcessed, updated: totalUpdated, duration: syncDuration, dateRange: dateRange }
        };
    } catch (error) {
        console.error('Sync process error:', error);
        return {
            success: false,
            message: 'Error during sync process',
            error: error.message,
            stats: { processed: totalProcessed, updated: totalUpdated, duration: Date.now() - syncStartTime }
        };
    }
};