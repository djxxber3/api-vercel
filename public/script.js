const { useState, useEffect, useMemo, useCallback } = React;

// --- Helper for API calls ---
const api = {
    async call(endpoint, method = 'GET', body = null) {
        const passkey = sessionStorage.getItem('adminPasskey');
        if (!passkey) throw new Error('Unauthorized');

        const headers = {
            'Content-Type': 'application/json',
            'X-Admin-Passkey': passkey
        };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(endpoint, options);
        if (response.status === 401) {
            throw new Error('Unauthorized');
        }
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'An API error occurred');
        }
        if (response.status === 204 || method === 'DELETE') return { success: true };
        return response.json();
    }
};

const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [matches, setMatches] = useState(null); // Use null to indicate not yet loaded
    const [channels, setChannels] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().slice(0, 10));
    const [modal, setModal] = useState({ type: null, data: null });

    const handleLogout = () => {
        sessionStorage.removeItem('adminPasskey');
        setIsAuthenticated(false);
        setMatches(null); // Clear data on logout
    };

    const handleLogin = (passkey) => {
        sessionStorage.setItem('adminPasskey', passkey);
        setIsAuthenticated(true);
    };
    
    // Check session on initial load
    useEffect(() => {
        if (sessionStorage.getItem('adminPasskey')) {
            setIsAuthenticated(true);
        } else {
            setLoading(false); // Only stop loading if not authenticated
        }
    }, []);

    // Fetch data when authenticated
    const fetchData = useCallback(async () => {
        if (!isAuthenticated) return;
        
        setLoading(true);
        try {
            const [matchesData, channelsData] = await Promise.all([
                api.call('/api/matches'),
                api.call('/api/channels')
            ]);
            setMatches(matchesData);
            setChannels(channelsData);
        } catch (err) {
            if (err.message === 'Unauthorized') {
                alert("جلسة غير صالحة أو كلمة مرور خاطئة. يتم تسجيل الخروج.");
                handleLogout();
            } else {
                alert("خطأ في جلب البيانات: " + err.message);
                setMatches([]); // Set to empty array on error to stop loading spinner
            }
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        fetchData();
    }, [isAuthenticated]);
    
    const onChannelUpdate = (updatedChannel) => setChannels(p => p.map(c => c.id === updatedChannel.id ? updatedChannel : c));
    const onChannelAdd = (newChannel) => setChannels(p => [...p, newChannel].sort((a,b) => a.name.localeCompare(b.name)));
    const onChannelDelete = (channelId) => setChannels(p => p.filter(c => c.id !== channelId));
    
    const changeDate = (days) => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + days);
        setCurrentDate(d.toISOString().slice(0, 10));
    };

    const groupedMatches = useMemo(() => {
        if (!matches) return {};
        return matches
            .filter(match => match.matchDate === currentDate)
            .reduce((acc, match) => {
                const league = match.competition.name;
                if (!acc[league]) acc[league] = { logo: match.competition.logo, country: match.competition.country, matches: [] };
                acc[league].matches.push(match);
                return acc;
            }, {});
    }, [matches, currentDate]);

    if (!isAuthenticated) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    // This handles the initial loading state correctly
    if (loading || matches === null) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <i className="fas fa-spinner fa-spin text-4xl text-gray-500"></i>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4">
            <Header onManageChannels={() => setModal({ type: 'channels' })} onForceSync={fetchData} onLogout={handleLogout} />
            <DateNavigator currentDate={currentDate} changeDate={changeDate} />
            <main>
                {Object.keys(groupedMatches).length === 0 ? (
                    <div className="text-center py-20 text-gray-500"><i className="fas fa-calendar-times text-5xl mb-4"></i><p>لا توجد مباريات في هذا اليوم.</p></div>
                ) : (
                    Object.entries(groupedMatches).map(([league, data]) => (
                        <div key={league} className="mb-6">
                            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-t-lg">
                                <img src={data.logo} alt={league} className="w-6 h-6 object-contain"/>
                                <div><h3 className="font-bold">{league}</h3><p className="text-xs text-gray-400">{data.country}</p></div>
                            </div>
                            <div className="space-y-px">
                                {data.matches.map(match => <MatchRow key={match.matchId} match={match} onLinkClick={() => setModal({ type: 'link', data: match })} />)}
                            </div>
                        </div>
                    ))
                )}
            </main>
            {modal.type === 'link' && <LinkChannelsModal match={modal.data} channels={channels} onClose={() => setModal({ type: null })} onComplete={fetchData} />}
            {modal.type === 'channels' && <ManageChannelsModal channels={channels} onClose={() => setModal({ type: null })} onChannelUpdate={onChannelUpdate} onChannelAdd={onChannelAdd} onChannelDelete={onChannelDelete} />}
        </div>
    );
};

const LoginScreen = ({ onLogin }) => {
    const [passkey, setPasskey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/verify-passkey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Passkey': passkey }
            });
            if (!response.ok) throw new Error('Invalid passkey');
            onLogin(passkey);
        } catch (err) {
            setError('كلمة المرور غير صحيحة.');
        } finally {
            setLoading(false);
        }
    };
    // ... (rest of the component is the same)
    return (
        <div className="flex items-center justify-center min-h-screen">
            <form onSubmit={handleSubmit} className="w-full max-w-sm p-8 space-y-6 bg-gray-800 rounded-lg shadow-xl">
                <h1 className="text-3xl font-bold text-center text-white">لوحة التحكم</h1>
                <div>
                    <label htmlFor="passkey" className="text-sm font-medium text-gray-300">كلمة المرور</label>
                    <input id="passkey" type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)}
                        className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="********" />
                </div>
                {error && <p className="text-sm text-center text-red-400">{error}</p>}
                <button type="submit" disabled={loading} className="w-full py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                    {loading ? <i className="fas fa-spinner fa-spin"></i> : 'دخول'}
                </button>
            </form>
        </div>
    );
};

// --- Child Components ---
// All other child components (Header, DateNavigator, MatchRow, Modals, etc.) are perfect
// and do not need to be changed from the previous version. Make sure they are present in your file.
// For brevity, I am not re-pasting all of them, but the MatchRow is below.

const Header = ({ onManageChannels, onForceSync, onLogout }) => (
    <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2"><i className="fas fa-shield-halved text-3xl text-blue-400"></i><h1 className="text-3xl font-black">Admin Panel</h1></div>
        <div className="flex items-center gap-4">
            <button onClick={onManageChannels} title="إدارة القنوات" className="text-gray-400 hover:text-white"><i className="fas fa-broadcast-tower text-2xl"></i></button>
            <button onClick={onForceSync} title="تحديث قسري" className="text-gray-400 hover:text-white"><i className="fas fa-sync-alt text-2xl"></i></button>
            <button onClick={onLogout} title="تسجيل الخروج" className="text-gray-400 hover:text-white"><i className="fas fa-sign-out-alt text-2xl"></i></button>
        </div>
    </header>
);
const DateNavigator = ({ currentDate, changeDate }) => {
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
    const isToday = new Date(currentDate).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
    return (
        <div className="flex items-center justify-between p-3 my-4 bg-gray-800 rounded-lg">
            <button onClick={() => changeDate(-1)} className="px-4 py-2 hover:bg-gray-700 rounded-md"><i className="fas fa-chevron-left"></i></button>
            <div className="text-center">
                <h2 className="text-lg font-bold">{formatDate(currentDate)}</h2>
                {isToday && <p className="text-sm text-blue-400">اليوم</p>}
            </div>
            <button onClick={() => changeDate(1)} className="px-4 py-2 hover:bg-gray-700 rounded-md"><i className="fas fa-chevron-right"></i></button>
        </div>
    );
};
const MatchRow = ({ match, onLinkClick }) => {
    const isLive = ['1H', 'HT', '2H', 'ET', 'P'].includes(match.status);
    const hasEnded = ['FT', 'AET', 'PEN'].includes(match.status);
    const notStarted = match.status === 'NS';
    return (
        <div onClick={onLinkClick} className="flex items-center p-4 bg-gray-800/50 hover:bg-gray-800 transition-colors cursor-pointer last:rounded-b-lg">
            <div className="flex-1 flex items-center justify-end gap-3"><span className="font-bold text-right hidden sm:inline">{match.homeTeam.name}</span><span className="font-bold text-right sm:hidden">{match.homeTeam.name.substring(0, 10)}</span><img src={match.homeTeam.logo} alt={match.homeTeam.name} className="w-8 h-8 rounded-full team-logo"/></div>
            <div className="w-28 text-center px-2">{notStarted ? (<div className="font-bold text-lg">{new Date(match.kickoffTime).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}</div>) : (<div className={`font-black text-2xl ${isLive ? 'text-red-500' : ''}`}>{match.homeTeam.goals ?? '-'} : {match.awayTeam.goals ?? '-'}</div>)}{isLive && <div className="text-xs font-bold text-red-500 animate-pulse">مباشر</div>}{hasEnded && <div className="text-xs text-gray-400">انتهت</div>}</div>
            <div className="flex-1 flex items-center gap-3"><img src={match.awayTeam.logo} alt={match.awayTeam.name} className="w-8 h-8 rounded-full team-logo"/><span className="font-bold text-left hidden sm:inline">{match.awayTeam.name}</span><span className="font-bold text-left sm:hidden">{match.awayTeam.name.substring(0, 10)}</span></div>
        </div>
    );
};
// Paste the modal components (LinkChannelsModal, ManageChannelsModal, etc.) from the previous correct version here.
// They do not need any changes.

ReactDOM.render(<App />, document.getElementById('root'));
