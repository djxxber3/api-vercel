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
    const [matches, setMatches] = useState(null);
    const [channels, setChannels] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().slice(0, 10));
    const [modal, setModal] = useState({ type: null, data: null });

    const handleLogout = () => {
        sessionStorage.removeItem('adminPasskey');
        setIsAuthenticated(false);
        setMatches(null);
    };

    const handleLogin = (passkey) => {
        sessionStorage.setItem('adminPasskey', passkey);
        setIsAuthenticated(true);
    };
    
    useEffect(() => {
        if (sessionStorage.getItem('adminPasskey')) {
            setIsAuthenticated(true);
        } else {
            setLoading(false);
        }
    }, []);

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
                alert("جلسة غير صالحة. يتم تسجيل الخروج.");
                handleLogout();
            } else {
                alert("خطأ في جلب البيانات: " + err.message);
                setMatches([]);
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

// --- Child Components ---

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

// --- ALL MODAL COMPONENTS ARE INCLUDED HERE ---

const LinkChannelsModal = ({ match, channels, onClose, onComplete }) => {
    const [selectedIds, setSelectedIds] = useState(match.broadcastChannels || []);
    const [loading, setLoading] = useState(false);
    const groupedChannels = useMemo(() => channels.reduce((acc, ch) => {
        if (!acc[ch.category]) acc[ch.category] = [];
        acc[ch.category].push(ch);
        return acc;
    }, {}), [channels]);

    const handleSave = async () => {
        setLoading(true);
        try {
            await api.call('/api/link', 'POST', { matchId: match.matchId, channelIds: selectedIds });
            onComplete(); 
            onClose();
        } catch (err) { 
            alert('Error: ' + err.message); 
        } finally { 
            setLoading(false); 
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="w-full max-w-2xl bg-gray-800 rounded-lg shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold">ربط القنوات</h2>
                    <p className="text-sm text-gray-400">{match.homeTeam.name} vs {match.awayTeam.name}</p>
                </header>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                    {Object.keys(groupedChannels).length === 0 ? (
                        <p className="text-center text-gray-400">لا توجد قنوات. أضف قناة أولاً.</p>
                    ) : Object.entries(groupedChannels).map(([category, chs]) => (
                        <div key={category}>
                            <h3 className="font-bold text-blue-400 mb-2">{category}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {chs.map(ch => (
                                    <label key={ch.id} className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${selectedIds.includes(ch.id) ? 'bg-blue-600/50 ring-2 ring-blue-500' : 'bg-gray-700/50 hover:bg-gray-700'}`}>
                                        <input type="checkbox" checked={selectedIds.includes(ch.id)} onChange={() => setSelectedIds(p => p.includes(ch.id) ? p.filter(i => i !== ch.id) : [...p, ch.id])} className="w-5 h-5 accent-blue-500" />
                                        <img src={ch.logo} alt={ch.name} className="w-8 h-8 rounded-md channel-logo" />
                                        <span className="font-semibold">{ch.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <footer className="p-4 flex justify-end gap-3 bg-gray-900/50 border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">إلغاء</button>
                    <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-md disabled:opacity-50">
                        {loading ? 'جاري الحفظ...' : 'حفظ'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

const ManageChannelsModal = ({ channels, onClose, onChannelUpdate, onChannelAdd, onChannelDelete }) => {
    const [mode, setMode] = useState('list');
    const [selectedChannel, setSelectedChannel] = useState(null);
    const handleEditClick = (channel) => { setSelectedChannel(channel); setMode('edit'); };
    const handleBackToList = () => { setMode('list'); setSelectedChannel(null); };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="w-full max-w-4xl bg-gray-800 rounded-lg shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 flex justify-between items-center border-b border-gray-700">
                    <h2 className="text-xl font-bold">إدارة القنوات</h2>
                    {mode === 'list' ? (
                        <button onClick={() => setMode('add')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md"><i className="fas fa-plus mr-2"></i>إضافة قناة</button>
                    ) : (
                        <button onClick={handleBackToList} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md"><i className="fas fa-arrow-left mr-2"></i>عودة</button>
                    )}
                </header>
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {mode === 'list' && <ChannelList channels={channels} onEdit={handleEditClick} onDelete={onChannelDelete} />}
                    {mode === 'add' && <ChannelForm onComplete={(newChannel) => { onChannelAdd(newChannel); handleBackToList(); }} />}
                    {mode === 'edit' && <ChannelForm channel={selectedChannel} onComplete={(updatedChannel) => { onChannelUpdate(updatedChannel); handleBackToList(); }} />}
                </div>
            </div>
        </div>
    );
};

const ChannelList = ({ channels, onEdit, onDelete }) => {
    const handleDelete = async (channelId) => {
        if (!confirm('هل أنت متأكد؟')) return;
        try { 
            await api.call(`/api/channels/${channelId}`, 'DELETE'); 
            onDelete(channelId); 
        } catch(err) { 
            alert("خطأ: " + err.message); 
        }
    };
    
    const getHealthStatus = (urls) => {
        if (!urls || urls.length === 0) return { healthy: 0, total: 0, status: 'none' };
        const healthy = urls.filter(url => url.isHealthy !== false).length;
        const total = urls.length;
        let status = 'good';
        if (healthy === 0) status = 'bad';
        else if (healthy < total * 0.5) status = 'warning';
        return { healthy, total, status };
    };
    
    return (
        <div className="space-y-3">
            {channels.length === 0 ? (
                <p className="text-center text-gray-400">لا توجد قنوات. أضف قناة جديدة.</p>
            ) : channels.map(ch => {
                const health = getHealthStatus(ch.urls);
                return (
                    <div key={ch.id} className="flex items-center gap-4 p-3 bg-gray-700/50 rounded-md">
                        <img src={ch.logo} alt={ch.name} className="w-10 h-10 rounded-md channel-logo"/>
                        <div className="flex-1">
                            <p className="font-bold">{ch.name}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-400">
                                <span>{ch.category}</span>
                                <span>{ch.urls?.length || 0} رابط</span>
                                {health.total > 0 && (
                                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
                                        health.status === 'good' ? 'bg-green-600/30 text-green-200' :
                                        health.status === 'warning' ? 'bg-yellow-600/30 text-yellow-200' :
                                        'bg-red-600/30 text-red-200'
                                    }`}>
                                        <i className={`fas ${
                                            health.status === 'good' ? 'fa-check-circle' :
                                            health.status === 'warning' ? 'fa-exclamation-triangle' :
                                            'fa-times-circle'
                                        }`}></i>
                                        <span>{health.healthy}/{health.total}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <button onClick={() => onEdit(ch)} className="text-blue-400 hover:text-blue-300 px-3" title="تحرير">
                            <i className="fas fa-edit"></i>
                        </button>
                        <button onClick={() => handleDelete(ch.id)} className="text-red-500 hover:text-red-400 px-3" title="حذف">
                            <i className="fas fa-trash"></i>
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

const ChannelForm = ({ channel = null, onComplete }) => {
    const isEditMode = !!channel;
    const [formData, setFormData] = useState({ 
        name: channel?.name || '', 
        category: channel?.category || '', 
        logo: channel?.logo || '', 
        urls: channel?.urls || [{ url: '', quality: 'HD', priority: 0, isHealthy: true }] 
    });
    const [loading, setLoading] = useState(false);
    const [healthChecking, setHealthChecking] = useState(false);
    
    const handleChange = (e) => setFormData(p => ({...p, [e.target.name]: e.target.value}));
    const handleUrlChange = (index, field, value) => { 
        const urls = [...formData.urls]; 
        urls[index][field] = field === 'priority' ? parseInt(value) || 0 : value; 
        setFormData(p => ({...p, urls})); 
    };
    const addUrlField = () => setFormData(p => ({ 
        ...p, 
        urls: [...p.urls, { url: '', quality: 'HD', priority: p.urls.length, isHealthy: true }] 
    }));
    const removeUrlField = index => setFormData(p => ({ ...p, urls: p.urls.filter((_, i) => i !== index) }));
    
    const handleSubmit = async (e) => {
        e.preventDefault(); 
        setLoading(true);
        try { 
            const result = isEditMode 
                ? await api.call(`/api/channels/${channel.id}`, 'PUT', formData) 
                : await api.call('/api/channels', 'POST', formData); 
            onComplete(result); 
        } catch(err) { 
            alert("خطأ: " + err.message); 
        } finally { 
            setLoading(false); 
        }
    };

    const checkUrlsHealth = async () => {
        if (!isEditMode) return;
        setHealthChecking(true);
        try {
            const result = await api.call(`/api/channels/${channel.id}/check-health`, 'POST');
            setFormData(p => ({...p, urls: result.channel.urls}));
            alert(`تم فحص الروابط: ${result.healthySummary.healthy}/${result.healthySummary.total} روابط تعمل بشكل طبيعي`);
        } catch (err) {
            alert("خطأ في فحص الروابط: " + err.message);
        } finally {
            setHealthChecking(false);
        }
    };

    const moveUrl = (index, direction) => {
        const urls = [...formData.urls];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= urls.length) return;
        
        [urls[index], urls[newIndex]] = [urls[newIndex], urls[index]];
        // Update priorities based on new positions
        urls.forEach((url, idx) => {
            url.priority = idx;
        });
        setFormData(p => ({...p, urls}));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="text-sm">اسم القناة</label><input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full mt-1 p-2 bg-gray-700 rounded-md" /></div>
                <div><label className="text-sm">الفئة</label><input type="text" name="category" value={formData.category} onChange={handleChange} required className="w-full mt-1 p-2 bg-gray-700 rounded-md" /></div>
                <div><label className="text-sm">رابط اللوجو</label><input type="url" name="logo" value={formData.logo} onChange={handleChange} required className="w-full mt-1 p-2 bg-gray-700 rounded-md" /></div>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold">روابط البث</h3>
                {isEditMode && (
                    <button 
                        type="button" 
                        onClick={checkUrlsHealth} 
                        disabled={healthChecking}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md disabled:opacity-50"
                    >
                        {healthChecking ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-heartbeat"></i>}
                        {healthChecking ? ' جاري الفحص...' : ' فحص الروابط'}
                    </button>
                )}
            </div>
            <div className="text-xs text-gray-400 mb-2">
                ترتيب الروابط حسب الأولوية (0 = أعلى أولوية). المشغل سيجرب الروابط بالترتيب عند فشل إحداها.
            </div>
            {formData.urls.map((item, index) => (
                <div key={index} className="flex items-end gap-2 p-3 bg-gray-700/30 rounded-md">
                    <div className="flex flex-col gap-1">
                        <button 
                            type="button" 
                            onClick={() => moveUrl(index, 'up')} 
                            disabled={index === 0}
                            className="p-1 text-xs bg-gray-600 hover:bg-gray-500 rounded disabled:opacity-50"
                        >
                            <i className="fas fa-chevron-up"></i>
                        </button>
                        <button 
                            type="button" 
                            onClick={() => moveUrl(index, 'down')} 
                            disabled={index === formData.urls.length - 1}
                            className="p-1 text-xs bg-gray-600 hover:bg-gray-500 rounded disabled:opacity-50"
                        >
                            <i className="fas fa-chevron-down"></i>
                        </button>
                    </div>
                    <div className="w-16">
                        <label className="text-xs">الأولوية</label>
                        <input 
                            type="number" 
                            value={item.priority || index} 
                            onChange={e => handleUrlChange(index, 'priority', e.target.value)} 
                            min="0"
                            className="w-full mt-1 p-1 text-sm bg-gray-700 rounded-md" 
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-sm">الرابط</label>
                        <input 
                            type="url" 
                            value={item.url} 
                            onChange={e => handleUrlChange(index, 'url', e.target.value)} 
                            required 
                            className="w-full mt-1 p-2 bg-gray-700 rounded-md" 
                        />
                    </div>
                    <div>
                        <label className="text-sm">الجودة</label>
                        <select 
                            value={item.quality} 
                            onChange={e => handleUrlChange(index, 'quality', e.target.value)} 
                            className="w-full mt-1 p-2 bg-gray-700 rounded-md"
                        >
                            <option>HD</option>
                            <option>FHD</option>
                            <option>4K</option>
                            <option>SD</option>
                            <option>Multi</option>
                        </select>
                    </div>
                    {item.isHealthy !== undefined && (
                        <div className="text-center">
                            <label className="text-xs">الحالة</label>
                            <div className={`mt-1 p-2 rounded-md text-xs ${item.isHealthy ? 'bg-green-600/50 text-green-200' : 'bg-red-600/50 text-red-200'}`}>
                                {item.isHealthy ? <i className="fas fa-check"></i> : <i className="fas fa-times"></i>}
                                {item.isHealthy ? ' يعمل' : ' معطل'}
                            </div>
                            {item.lastChecked && (
                                <div className="text-xs text-gray-500 mt-1">
                                    {new Date(item.lastChecked).toLocaleString('ar-EG')}
                                </div>
                            )}
                        </div>
                    )}
                    <button 
                        type="button" 
                        onClick={() => removeUrlField(index)} 
                        disabled={formData.urls.length <= 1} 
                        className="p-2 h-10 bg-red-600/50 hover:bg-red-600 rounded-md disabled:opacity-50"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            ))}
            <button type="button" onClick={addUrlField} className="text-blue-400 hover:text-blue-300">+ إضافة رابط آخر</button>
            <footer className="pt-4 flex justify-end">
                <button type="submit" disabled={loading} className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-md disabled:opacity-50">
                    {loading ? '...' : (isEditMode ? 'حفظ التعديلات' : 'إضافة القناة')}
                </button>
            </footer>
        </form>
    );
};


ReactDOM.render(<App />, document.getElementById('root'));
