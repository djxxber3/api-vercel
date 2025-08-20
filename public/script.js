const { useState, useEffect, useMemo, useCallback } = React;

const App = () => {
    // State management
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passkey, setPasskey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    
    const [matches, setMatches] = useState([]);
    const [channels, setChannels] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().slice(0, 10));

    const [modal, setModal] = useState({ type: null, data: null }); // type: 'link' | 'channels'

    // --- Authentication ---
    useEffect(() => {
        const storedPasskey = sessionStorage.getItem('adminPasskey');
        if (storedPasskey) {
            setPasskey(storedPasskey);
            setIsAuthenticated(true);
        } else {
            setLoading(false);
        }
    }, []);

    const handleLogin = (e) => {
        e.preventDefault();
        // In a real app, you'd verify this against a backend endpoint.
        // For this project, we trust the entered passkey and store it.
        if (passkey) {
            sessionStorage.setItem('adminPasskey', passkey);
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('كلمة المرور مطلوبة.');
        }
    };
    
    // --- Data Fetching ---
    const fetchData = useCallback(async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const [matchesRes, channelsRes] = await Promise.all([
                fetch('/api/matches', { headers: { 'X-Admin-Passkey': passkey } }),
                fetch('/api/channels', { headers: { 'X-Admin-Passkey': passkey } })
            ]);
            if (!matchesRes.ok || !channelsRes.ok) throw new Error('فشل في جلب البيانات.');
            
            const matchesData = await matchesRes.json();
            const channelsData = await channelsRes.json();
            
            setMatches(matchesData);
            setChannels(channelsData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, passkey]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleForceSync = async () => {
        if (!confirm('هل أنت متأكد من رغبتك في تحديث بيانات المباريات؟')) return;
        setLoading(true);
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'X-Admin-Passkey': passkey }
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'فشل التحديث.');
            alert(result.message);
            fetchData();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- Date and Match Filtering ---
    const changeDate = (days) => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        setCurrentDate(newDate.toISOString().slice(0, 10));
    };

    const groupedMatches = useMemo(() => {
        return matches
            .filter(match => match.matchDate === currentDate)
            .reduce((acc, match) => {
                const league = match.competition.name;
                if (!acc[league]) {
                    acc[league] = { logo: match.competition.logo, country: match.competition.country, matches: [] };
                }
                acc[league].matches.push(match);
                return acc;
            }, {});
    }, [matches, currentDate]);
    
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const formatTime = (dateString) => new Date(dateString).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // --- Render Components ---

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <form onSubmit={handleLogin} className="w-full max-w-sm p-8 space-y-6 bg-gray-800 rounded-lg shadow-xl">
                    <h1 className="text-3xl font-bold text-center text-white">لوحة التحكم</h1>
                    <div>
                        <label htmlFor="passkey" className="text-sm font-medium text-gray-300">كلمة المرور</label>
                        <input
                            id="passkey"
                            type="password"
                            value={passkey}
                            onChange={(e) => setPasskey(e.target.value)}
                            className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="********"
                        />
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <button type="submit" className="w-full py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
                        دخول
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4">
            {/* Header */}
            <header className="flex items-center justify-between py-4">
                 <div className="flex items-center gap-2">
                    <i className="fas fa-shield-halved text-3xl text-blue-400"></i>
                    <h1 className="text-3xl font-black">Admin Panel</h1>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setModal({ type: 'channels', data: null })} title="إدارة القنوات" className="text-gray-400 hover:text-white transition-colors"><i className="fas fa-broadcast-tower text-2xl"></i></button>
                    <button onClick={handleForceSync} title="تحديث قسري" className="text-gray-400 hover:text-white transition-colors"><i className="fas fa-sync-alt text-2xl"></i></button>
                </div>
            </header>
            
            {/* Date Navigator */}
            <div className="flex items-center justify-between p-3 my-4 bg-gray-800 rounded-lg">
                <button onClick={() => changeDate(-1)} className="px-4 py-2 hover:bg-gray-700 rounded-md"><i className="fas fa-chevron-left"></i></button>
                <div className="text-center">
                    <h2 className="text-lg font-bold">{formatDate(currentDate)}</h2>
                    <p className="text-sm text-gray-400">
                        {new Date(currentDate).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) ? 'اليوم' : ''}
                    </p>
                </div>
                <button onClick={() => changeDate(1)} className="px-4 py-2 hover:bg-gray-700 rounded-md"><i className="fas fa-chevron-right"></i></button>
            </div>
            
            {/* Matches List */}
            <main>
                {loading ? (
                     <div className="text-center py-20"><i className="fas fa-spinner fa-spin text-4xl text-gray-500"></i></div>
                ) : Object.keys(groupedMatches).length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <i className="fas fa-calendar-times text-5xl mb-4"></i>
                        <p>لا توجد مباريات في هذا اليوم.</p>
                    </div>
                ) : (
                    Object.entries(groupedMatches).map(([league, data]) => (
                        <div key={league} className="mb-6">
                            <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-t-lg">
                                <img src={data.logo} alt={league} className="w-6 h-6 object-contain"/>
                                <div>
                                    <h3 className="font-bold">{league}</h3>
                                    <p className="text-xs text-gray-400">{data.country}</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                {data.matches.map(match => <MatchRow key={match.matchId} match={match} onLinkClick={() => setModal({ type: 'link', data: match })} />)}
                            </div>
                        </div>
                    ))
                )}
            </main>

            {/* Modals */}
            {modal.type === 'link' && <LinkChannelsModal match={modal.data} channels={channels} passkey={passkey} onClose={() => setModal({type: null, data: null})} onComplete={fetchData} />}
            {modal.type === 'channels' && <ManageChannelsModal channels={channels} passkey={passkey} onClose={() => setModal({type: null, data: null})} onComplete={fetchData} />}
        </div>
    );
};

const MatchRow = ({ match, onLinkClick }) => {
    const isLive = ['1H', 'HT', '2H', 'ET', 'P'].includes(match.status);
    const hasEnded = ['FT', 'AET', 'PEN'].includes(match.status);

    return (
        <div onClick={onLinkClick} className="flex items-center p-4 bg-gray-800/50 hover:bg-gray-800 transition-colors cursor-pointer last:rounded-b-lg">
            {/* Time / Status */}
            <div className="w-20 text-center">
                {isLive ? (
                    <div className="relative text-red-500 font-bold">
                        <span className="relative z-10">Live</span>
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full live-indicator"></span>
                    </div>
                ) : hasEnded ? (
                    <span className="text-xs text-gray-400">انتهت</span>
                ) : (
                    <span className="font-bold">{new Date(match.kickoffTime).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}</span>
                )}
            </div>
            
            {/* Teams */}
            <div className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex justify-between items-center">
                    <span className="text-right font-semibold">{match.homeTeam.name}</span>
                    <img src={match.homeTeam.logo} alt={match.homeTeam.name} className="w-8 h-8 rounded-full team-logo"/>
                </div>
                 <div className="w-full flex justify-between items-center">
                    <span className="text-right font-semibold">{match.awayTeam.name}</span>
                    <img src={match.awayTeam.logo} alt={match.awayTeam.name} className="w-8 h-8 rounded-full team-logo"/>
                </div>
            </div>
            
            {/* Score */}
            <div className="w-20 text-center font-bold text-xl">
                 <div>{match.homeTeam.goals ?? '-'}</div>
                 <div>{match.awayTeam.goals ?? '-'}</div>
            </div>
            
            {/* Link Indicator */}
            <div className="w-10 text-center text-xl">
                {match.broadcastChannels?.length > 0 ? (
                    <i className="fas fa-link text-blue-400" title={`${match.broadcastChannels.length} channels linked`}></i>
                ) : (
                     <i className="fas fa-unlink text-gray-600" title="No channels linked"></i>
                )}
            </div>
        </div>
    );
};

// --- Modals ---

const LinkChannelsModal = ({ match, channels, passkey, onClose, onComplete }) => {
    const [selectedIds, setSelectedIds] = useState(match.broadcastChannels || []);
    const [loading, setLoading] = useState(false);
    
    const groupedChannels = useMemo(() => channels.reduce((acc, ch) => {
        if (!acc[ch.category]) acc[ch.category] = [];
        acc[ch.category].push(ch);
        return acc;
    }, {}), [channels]);

    const handleToggle = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Passkey': passkey },
                body: JSON.stringify({ matchId: match.matchId, channelIds: selectedIds })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            onComplete();
            onClose();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 modal-enter-active" onClick={onClose}>
            <div className="w-full max-w-2xl bg-gray-800 rounded-lg shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold">ربط القنوات</h2>
                    <p className="text-sm text-gray-400">{match.homeTeam.name} vs {match.awayTeam.name}</p>
                </header>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                    {Object.entries(groupedChannels).map(([category, chs]) => (
                        <div key={category}>
                            <h3 className="font-bold text-blue-400 mb-2">{category}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {chs.map(ch => (
                                    <label key={ch.id} className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${selectedIds.includes(ch.id) ? 'bg-blue-600/50 ring-2 ring-blue-500' : 'bg-gray-700/50 hover:bg-gray-700'}`}>
                                        <input type="checkbox" checked={selectedIds.includes(ch.id)} onChange={() => handleToggle(ch.id)} className="w-5 h-5 accent-blue-500" />
                                        <img src={ch.logo} alt={ch.name} className="w-8 h-8 rounded-md channel-logo" />
                                        <span className="font-semibold">{ch.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <footer className="p-4 flex justify-end gap-3 bg-gray-900/50">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md transition-colors">إلغاء</button>
                    <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-md transition-colors disabled:opacity-50">
                        {loading ? 'جاري الحفظ...' : 'حفظ'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

const ManageChannelsModal = ({ channels, passkey, onClose, onComplete }) => {
    // Component to add, view, and delete channels
    const [view, setView] = useState('list'); // 'list' or 'add'
    const [newChannel, setNewChannel] = useState({ name: '', category: '', logo: '', urls: [{ url: '', quality: 'HD' }] });
    const [loading, setLoading] = useState(false);
    
    const addUrlField = () => setNewChannel(prev => ({ ...prev, urls: [...prev.urls, { url: '', quality: 'HD' }] }));
    const removeUrlField = index => setNewChannel(prev => ({ ...prev, urls: prev.urls.filter((_, i) => i !== index) }));
    const handleUrlChange = (index, field, value) => {
        const updatedUrls = [...newChannel.urls];
        updatedUrls[index][field] = value;
        setNewChannel(prev => ({ ...prev, urls: updatedUrls }));
    };

    const handleAddChannel = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Passkey': passkey },
                body: JSON.stringify(newChannel)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            onComplete();
            setView('list');
            setNewChannel({ name: '', category: '', logo: '', urls: [{ url: '', quality: 'HD' }] });
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };
    
    const handleDeleteChannel = async (channelId) => {
        if (!confirm('هل أنت متأكد من حذف هذه القناة؟')) return;
        try {
            const res = await fetch(`/api/channels/${channelId}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Passkey': passkey }
            });
            if (!res.ok) throw new Error((await res.json()).error);
            onComplete();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 modal-enter-active" onClick={onClose}>
            <div className="w-full max-w-4xl bg-gray-800 rounded-lg shadow-xl" onClick={e => e.stopPropagation()}>
                <header className="p-4 flex justify-between items-center border-b border-gray-700">
                    <h2 className="text-xl font-bold">إدارة القنوات</h2>
                    <button onClick={() => setView(v => v === 'list' ? 'add' : 'list')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md transition-colors">
                        <i className={`fas ${view === 'list' ? 'fa-plus' : 'fa-list'} mr-2`}></i>
                        {view === 'list' ? 'إضافة قناة' : 'عرض القنوات'}
                    </button>
                </header>

                {view === 'list' ? (
                    <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                        {channels.map(ch => (
                            <div key={ch.id} className="flex items-center gap-4 p-3 bg-gray-700/50 rounded-md">
                                <img src={ch.logo} alt={ch.name} className="w-10 h-10 rounded-md channel-logo"/>
                                <div className="flex-1">
                                    <p className="font-bold">{ch.name}</p>
                                    <p className="text-xs text-gray-400">{ch.category} - {ch.urls.length} رابط</p>
                                </div>
                                <button onClick={() => handleDeleteChannel(ch.id)} className="text-red-500 hover:text-red-400 px-3"><i className="fas fa-trash"></i></button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <form onSubmit={handleAddChannel} className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div>
                                <label className="text-sm">اسم القناة</label>
                                <input type="text" value={newChannel.name} onChange={e => setNewChannel(p=>({...p, name: e.target.value}))} required className="w-full mt-1 p-2 bg-gray-700 rounded-md" />
                            </div>
                            <div>
                                <label className="text-sm">الفئة</label>
                                <input type="text" value={newChannel.category} onChange={e => setNewChannel(p=>({...p, category: e.target.value}))} required className="w-full mt-1 p-2 bg-gray-700 rounded-md" />
                            </div>
                            <div>
                                <label className="text-sm">رابط اللوجو</label>
                                <input type="url" value={newChannel.logo} onChange={e => setNewChannel(p=>({...p, logo: e.target.value}))} required className="w-full mt-1 p-2 bg-gray-700 rounded-md" />
                            </div>
                        </div>
                        <h3 className="text-lg font-semibold pt-4 border-t border-gray-700">روابط البث</h3>
                        {newChannel.urls.map((item, index) => (
                            <div key={index} className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="text-sm">الرابط</label>
                                    <input type="url" value={item.url} onChange={e => handleUrlChange(index, 'url', e.target.value)} required className="w-full mt-1 p-2 bg-gray-700 rounded-md" />
                                </div>
                                <div>
                                    <label className="text-sm">الجودة</label>
                                    <select value={item.quality} onChange={e => handleUrlChange(index, 'quality', e.target.value)} className="w-full mt-1 p-2 bg-gray-700 rounded-md">
                                        <option>HD</option><option>FHD</option><option>4K</option><option>SD</option><option>Multi</option>
                                    </select>
                                </div>
                                <button type="button" onClick={() => removeUrlField(index)} disabled={newChannel.urls.length <= 1} className="p-2 h-10 bg-red-600/50 hover:bg-red-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"><i className="fas fa-times"></i></button>
                            </div>
                        ))}
                        <button type="button" onClick={addUrlField} className="text-blue-400 hover:text-blue-300">+ إضافة رابط آخر</button>
                        <footer className="pt-4 flex justify-end">
                            <button type="submit" disabled={loading} className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-md transition-colors disabled:opacity-50">
                                {loading ? 'جاري الإضافة...' : 'إضافة القناة'}
                            </button>
                        </footer>
                    </form>
                )}
            </div>
        </div>
    );
};

ReactDOM.render(<App />, document.getElementById('root'));
