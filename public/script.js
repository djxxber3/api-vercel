const { useEffect, useState, useCallback } = React;

function AdminPanel() {
    const [configError, setConfigError] = useState(false);
    const [allMatches, setAllMatches] = useState([]);
    const [displayedMatches, setDisplayedMatches] = useState([]);
    const [channels, setChannels] = useState([]);
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [selectedChannels, setSelectedChannels] = useState([]);
    const [newChannel, setNewChannel] = useState({ name: "", urls: [{ url: "", type: "HD" }] });
    const [loading, setLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [loadingClear, setLoadingClear] = useState(false);
    const [notification, setNotification] = useState({ show: false, message: "", type: "" });
    const [activeTab, setActiveTab] = useState('link');
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [stats, setStats] = useState({ totalMatches: 0, linkedMatches: 0, totalChannels: 0 });

    const showNotification = (message, type = "success") => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification({ show: false, message: "", type: "" }), 4000);
    };

    const fetchMatches = useCallback(async () => {
        const response = await fetch('/api/matches');
        const data = await response.json();
        return data.map((match) => ({
            ...match,
            hasChannels: match.broadcastChannels && match.broadcastChannels.length > 0
        }));
    }, []);

    const fetchChannels = useCallback(async () => {
        const response = await fetch('/api/channels');
        const data = await response.json();
        return data.map(channel => ({ id: channel.id, ...channel }));
    }, []);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [matchesArray, channelsArray] = await Promise.all([fetchMatches(), fetchChannels()]);
            setAllMatches(matchesArray);
            setChannels(channelsArray);
            const linkedCount = matchesArray.filter((m) => m.hasChannels).length;
            setStats({
                totalMatches: matchesArray.length,
                linkedMatches: linkedCount,
                totalChannels: channelsArray.length
            });
        } catch (error) {
            showNotification("خطأ في جلب البيانات: " + error.message, "error");
        } finally {
            setLoading(false);
            setIsInitialLoading(false);
        }
    }, [fetchMatches, fetchChannels]);
    
    const getDateOptions = () => {
        const today = new Date();
        const options = [];
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        options.push({ date: yesterday, label: `أمس - ${yesterday.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}`, value: yesterday.toISOString().slice(0, 10) });
        options.push({ date: today, label: `اليوم - ${today.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}`, value: today.toISOString().slice(0, 10) });
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        options.push({ date: tomorrow, label: `غداً - ${tomorrow.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}`, value: tomorrow.toISOString().slice(0, 10) });
        return options;
    };

    const [selectedDateOption, setSelectedDateOption] = useState(getDateOptions()[1].value);

    const updateDisplayedMatches = useCallback(() => {
        let filtered = allMatches.filter(match => match.matchDate === selectedDateOption);
        if (searchTerm.trim()) {
            const normalizedSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(match => 
                match.homeTeam.name.toLowerCase().includes(normalizedSearchTerm) ||
                match.awayTeam.name.toLowerCase().includes(normalizedSearchTerm) ||
                match.competition.name.toLowerCase().includes(normalizedSearchTerm)
            );
        }
        setDisplayedMatches(filtered);
    }, [allMatches, selectedDateOption, searchTerm]);

    useEffect(() => {
        if (!configError) {
            fetchData();
        }
        document.body.classList.toggle('dark-mode', isDarkMode);
    }, [isDarkMode, fetchData, configError]);
    
    useEffect(() => {
        updateDisplayedMatches();
        if (selectedMatch) {
            setSelectedMatch(null);
            setSelectedChannels([]);
        }
    }, [updateDisplayedMatches, selectedMatch]);

    const handleLinkChannels = async () => {
        if (!selectedMatch) {
            showNotification("الرجاء اختيار مباراة", "error");
            return;
        }
        if (selectedChannels.length === 0) {
            showNotification("الرجاء اختيار قناة واحدة على الأقل", "error");
            return;
        }
        try {
            setLoading(true);
            const response = await fetch(`/api/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Passkey': 'YOUR_ADMIN_PANEL_PASSKEY' }, // Use your passkey here
                body: JSON.stringify({
                    matchId: selectedMatch.matchId,
                    channels: selectedChannels
                })
            });
            const result = await response.json();
            if (response.ok) {
                showNotification(result.message, "success");
                setSelectedChannels([]);
                setSelectedMatch(null);
                fetchData();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            showNotification("خطأ في ربط القنوات: " + error.message, "error");
        } finally {
            setLoading(false);
        }
    };
    
    const handleAddChannel = async () => {
        if (!newChannel.name.trim()) {
            showNotification("الرجاء إدخال اسم القناة", "error");
            return;
        }
        const validUrls = newChannel.urls.filter(u => u.url && u.url.trim());
        if (validUrls.length === 0) {
            showNotification("الرجاء إدخال رابط واحد على الأقل", "error");
            return;
        }
        try {
            setLoading(true);
            const response = await fetch('/api/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Passkey': 'YOUR_ADMIN_PANEL_PASSKEY' }, // Use your passkey here
                body: JSON.stringify({
                    name: newChannel.name.trim(),
                    urls: validUrls
                })
            });
            const result = await response.json();
            if (response.ok) {
                showNotification("تم إضافة القناة بنجاح", "success");
                setNewChannel({ name: "", urls: [{ url: "", type: "HD" }] });
                fetchData();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            showNotification("خطأ في إضافة القناة: " + error.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteChannel = async (channelId, channelName) => {
        if (!window.confirm(`هل أنت متأكد من حذف قناة "${channelName}"؟\nسيتم إزالتها من جميع المباريات المرتبطة بها.`)) return;
        try {
            setLoading(true);
            const response = await fetch(`/api/channels?id=${channelId}`, { 
                method: 'DELETE',
                headers: { 'X-Admin-Passkey': 'YOUR_ADMIN_PANEL_PASSKEY' } // Use your passkey here
            });
            if (response.ok) {
                showNotification(`تم حذف قناة "${channelName}" بنجاح`, "success");
                fetchData();
            } else {
                throw new Error("Failed to delete channel");
            }
        } catch (error) {
            showNotification("خطأ في حذف القناة: " + error.message, "error");
        } finally {
            setLoading(false);
        }
    };
    
    const handleForcedSync = async () => {
        if (!window.confirm("هل أنت متأكد من التحديث القسري؟\nسيتم جلب أحدث البيانات من API مباشرة.")) return;
        try {
            setLoading(true);
            const passkey = window.prompt("Please enter the admin passkey:");
            if (!passkey) {
                setLoading(false);
                showNotification("تم إلغاء عملية التحديث", "error");
                return;
            }
            const response = await fetch("/api/sync", { 
                method: "POST",
                headers: {
                    'X-Admin-Passkey': passkey
                }
            });
            const result = await response.json();
            if (response.ok) {
                showNotification(result.message, "success");
                fetchData();
            } else {
                showNotification(result.error || result.message || "خطأ في التحديث", "error");
            }
        } catch (error) {
            showNotification("خطأ في الاتصال بالخادم", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleClearAllData = async () => {
        const confirmation = window.prompt("⚠️ تحذير: هذه العملية ستحذف كل المباريات والقنوات بشكل دائم!\n\nاكتب 'احذف كل شيء' للتأكيد:");
        if (confirmation !== "احذف كل شيء") {
            showNotification("تم إلغاء عملية الحذف", "error");
            return;
        }
        try {
            setLoadingClear(true);
            const response = await fetch(`/api/matches?clear=true`, { 
                method: "DELETE",
                headers: { 'X-Admin-Passkey': 'YOUR_ADMIN_PANEL_PASSKEY' } // Use your passkey here
            });
            if (response.ok) {
                showNotification("تم حذف جميع البيانات بنجاح", "success");
                fetchData();
            } else {
                throw new Error("Failed to clear data");
            }
        } catch (error) {
            showNotification("خطأ في حذف البيانات: " + error.message, "error");
        } finally {
            setLoadingClear(false);
        }
    };
    
    const handleMatchSelect = (match) => {
        setSelectedMatch(match);
        setSelectedChannels(match.broadcastChannels || []);
    };

    const getMatchStatusColor = (status) => {
        if (['1H', 'HT', '2H', 'ET'].includes(status)) return 'status-live';
        if (status === 'NS') return 'status-upcoming';
        return 'status-finished';
    };
    
    const formatMatchTime = (dateString) => {
        return new Date(dateString).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    if (isInitialLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-white">
                <div className="glass-effect rounded-2xl p-8 text-center">
                    <div className="loading-spinner mb-6 mx-auto"></div>
                    <h2 className="text-2xl font-bold mb-2">جاري التحميل...</h2>
                    <p className="text-lg opacity-90">يتم تحضير لوحة الإدارة</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="glass-effect rounded-2xl shadow-2xl mb-8 p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2">
                                ⚽ لوحة الإدارة المطورة
                            </h1>
                            <p className="text-lg text-white opacity-90">
                                إدارة ذكية للمباريات والقنوات
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 rounded-lg p-3 text-white text-center min-w-[80px]">
                                <div className="text-2xl font-bold">{stats.totalMatches}</div>
                                <div className="text-xs">مباريات</div>
                            </div>
                            <div className="bg-white/20 rounded-lg p-3 text-white text-center min-w-[80px]">
                                <div className="text-2xl font-bold">{stats.linkedMatches}</div>
                                <div className="text-xs">مربوطة</div>
                            </div>
                            <div className="bg-white/20 rounded-lg p-3 text-white text-center min-w-[80px]">
                                <div className="text-2xl font-bold">{stats.totalChannels}</div>
                                <div className="text-xs">قنوات</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 mt-6">
                        <button
                            onClick={handleForcedSync}
                            disabled={loading}
                            className="btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <><i className="fas fa-spinner fa-spin ml-2"></i> جاري التحديث...</>
                            ) : (
                                <><i className="fas fa-sync-alt ml-2"></i> تحديث قسري</>
                            )}
                        </button>
                        
                        <button
                            onClick={handleClearAllData}
                            disabled={loadingClear}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loadingClear ? (
                                <><i className="fas fa-spinner fa-spin ml-2"></i> جاري الحذف...</>
                            ) : (
                                <><i className="fas fa-trash-alt ml-2"></i> حذف الكل</>
                            )}
                        </button>
                        
                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
                        >
                            <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'} ml-2`}></i>
                            {isDarkMode ? 'النمط الفاتح' : 'النمط الداكن'}
                        </button>
                    </div>
                </header>

                <div className={`notification fixed top-4 left-4 z-50 p-4 rounded-xl shadow-2xl max-w-md ${notification.show ? 'show' : ''} ${
                    notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                }`}>
                    <div className="flex items-center">
                        <i className={`fas ${notification.type === 'error' ? 'fa-exclamation-triangle' : 'fa-check-circle'} ml-2 text-xl`}></i>
                        <span className="font-semibold">{notification.message}</span>
                    </div>
                </div>

                <div className="glass-effect rounded-2xl shadow-lg mb-8">
                    <nav className="flex flex-wrap">
                        {[
                            { key: 'link', label: '🔗 ربط القنوات', icon: 'fa-link', desc: 'ربط القنوات بالمباريات' },
                            { key: 'add', label: '➕ إضافة قناة', icon: 'fa-plus-circle', desc: 'إضافة قناة جديدة' },
                            { key: 'manage', label: '⚙️ إدارة القنوات', icon: 'fa-cog', desc: 'حذف وتعديل القنوات' }
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex-1 py-4 px-6 text-sm font-medium transition-all duration-300 first:rounded-tr-2xl last:rounded-tl-2xl ${
                                    activeTab === tab.key
                                        ? 'bg-blue-500 text-white shadow-lg transform scale-105'
                                        : 'text-white hover:bg-white/20'
                                }`}
                            >
                                <div className="flex flex-col items-center">
                                    <i className={`fas ${tab.icon} text-xl mb-1`}></i>
                                    <span className="font-bold">{tab.label}</span>
                                    <span className="text-xs opacity-75">{tab.desc}</span>
                                </div>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="glass-effect rounded-2xl shadow-2xl p-6 md:p-8">
                    {activeTab === 'link' && (
                        <div className="space-y-8">
                            <div className="text-center">
                                <h2 className="text-3xl font-bold text-white mb-4">🔗 ربط القنوات بالمباريات</h2>
                                <p className="text-lg text-white opacity-90">اختر مباراة من أحد الأيام الثلاثة ثم حدد القنوات المناسبة</p>
                            </div>
                            
                            <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                                <label className="text-white font-semibold">اختر التاريخ:</label>
                                <select
                                    value={selectedDateOption}
                                    onChange={(e) => setSelectedDateOption(e.target.value)}
                                    className="px-4 py-2 rounded-lg border-2 border-white/30 bg-white/20 text-white font-medium focus:outline-none focus:border-blue-400"
                                >
                                    {getDateOptions().map(option => (
                                        <option key={option.value} value={option.value} className="text-gray-800">
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="max-w-md mx-auto">
                                <div className="relative">
                                    <i className="fas fa-search absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60"></i>
                                    <input
                                        type="text"
                                        placeholder="ابحث في المباريات..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pr-10 py-3 rounded-lg border-2 border-white/30 bg-white/20 text-white placeholder-white/60 focus:outline-none focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            
                            <div className="grid gap-4 max-h-96 overflow-y-auto">
                                {displayedMatches.length > 0 ? (
                                    displayedMatches.map(match => (
                                        <div 
                                            key={match.matchId}
                                            onClick={() => handleMatchSelect(match)}
                                            className={`match-card p-4 rounded-xl cursor-pointer transition-all duration-300 ${
                                                selectedMatch?.matchId === match.matchId 
                                                    ? 'selected bg-blue-500/30 border-2 border-blue-400' 
                                                    : 'bg-white/20 border-2 border-white/30 hover:bg-white/30'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center flex-1">
                                                    <img src={match.homeTeam.logo || `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#1f2937" stroke="#9ca3af" stroke-width="2"/><text x="20" y="25" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold">${match.homeTeam.name.charAt(0)}</text></svg>`)}`} alt={match.homeTeam.name} className="w-10 h-10 rounded-full ml-3" />
                                                    <span className="text-white font-bold text-lg">{match.homeTeam.name}</span>
                                                </div>
                                                
                                                <div className="text-center mx-4">
                                                    <div className="text-white font-bold text-lg">{formatMatchTime(match.kickoffTime)}</div>
                                                    <div className="flex items-center justify-center">
                                                        <span className={`status-indicator ${getMatchStatusColor(match.status)}`}></span>
                                                        <span className="text-white/80 text-sm">{match.statusText}</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center flex-1 justify-end">
                                                    <span className="text-white font-bold text-lg mr-3">{match.awayTeam.name}</span>
                                                    <img src={match.awayTeam.logo || `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#1f2937" stroke="#9ca3af" stroke-width="2"/><text x="20" y="25" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold">${match.awayTeam.name.charAt(0)}</text></svg>`)}`} alt={match.awayTeam.name} className="w-10 h-10 rounded-full" />
                                                </div>
                                            </div>
                                            
                                            <div className="mt-3 flex items-center justify-between">
                                                <div className="text-white/80 text-sm">
                                                    <i className="fas fa-trophy ml-1"></i>
                                                    {match.competition.name}
                                                </div>
                                                {selectedMatch?.matchId === match.matchId && (
                                                    <div className="text-blue-300 font-medium pulse-animation">
                                                        <i className="fas fa-check-circle ml-1"></i>
                                                        تم الاختيار
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12">
                                        <i className="fas fa-calendar-times text-6xl text-white/50 mb-4"></i>
                                        <p className="text-white text-xl font-semibold">لا توجد مباريات متاحة</p>
                                        <p className="text-white/80 mt-2">في التاريخ المحدد أو ضمن نتائج البحث</p>
                                    </div>
                                )}
                            </div>
                            
                            {selectedMatch && (
                                <div className="bg-white/10 rounded-xl p-6 border border-white/20">
                                    <h3 className="text-2xl font-bold text-white mb-4 text-center">
                                        🎯 ربط القنوات للمباراة
                                    </h3>
                                    <div className="bg-blue-500/20 rounded-lg p-4 mb-6 text-center">
                                        <div className="text-white font-bold text-lg">
                                            {selectedMatch.homeTeam.name} 🆚 {selectedMatch.awayTeam.name}
                                        </div>
                                        <div className="text-white/80 text-sm mt-1">
                                            {selectedMatch.competition.name} • {formatMatchTime(selectedMatch.kickoffTime)}
                                        </div>
                                    </div>
                                    
                                    {channels.length > 0 ? (
                                        <div className="grid md:grid-cols-2 gap-4 mb-6">
                                            {channels.map(channel => (
                                                <label key={channel.id} className="flex items-center p-3 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20 transition-all">
                                                    <input
                                                        type="checkbox"
                                                        value={channel.id}
                                                        checked={selectedChannels.includes(channel.id)}
                                                        onChange={(e) => {
                                                            const isChecked = e.target.checked;
                                                            setSelectedChannels(prev => 
                                                                isChecked ? [...prev, channel.id] : prev.filter(id => id !== channel.id)
                                                            );
                                                        }}
                                                        className="w-5 h-5 text-blue-600 bg-white/20 rounded border-white/30 focus:ring-blue-500"
                                                    />
                                                    <div className="ml-3">
                                                        <div className="text-white font-semibold">{channel.name}</div>
                                                        <div className="text-white/70 text-xs">
                                                            {channel.urls.length} رابط • {channel.urls.map(u => u.type).join(', ')}
                                                        </div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8">
                                            <i className="fas fa-broadcast-tower text-4xl text-white/50 mb-4"></i>
                                            <p className="text-white">لا توجد قنوات متاحة</p>
                                            <p className="text-white/80 text-sm">أضف قناة جديدة أولاً</p>
                                        </div>
                                    )}
                                    
                                    <button
                                        onClick={handleLinkChannels}
                                        disabled={loading || selectedChannels.length === 0}
                                        className="w-full btn-primary text-white font-bold py-4 px-6 rounded-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? (
                                            <><i className="fas fa-spinner fa-spin ml-2"></i> جاري الربط...</>
                                        ) : (
                                            <><i className="fas fa-link ml-2"></i> تأكيد ربط {selectedChannels.length} قناة</>
                                        )}
                                    </button>
                                </div>
                            )}

                        </div>
                    )}

                    {activeTab === 'add' && (
                        <div className="space-y-8">
                            <div className="text-center">
                                <h2 className="text-3xl font-bold text-white mb-4">➕ إضافة قناة بث جديدة</h2>
                                <p className="text-lg text-white opacity-90">أدخل تفاصيل القناة وروابط البث المختلفة</p>
                            </div>
                            
                            <div className="max-w-2xl mx-auto space-y-6">
                                <div>
                                    <label htmlFor="channelName" className="block text-lg font-semibold text-white mb-2">
                                        <i className="fas fa-broadcast-tower ml-2"></i>
                                        اسم القناة
                                    </label>
                                    <input
                                        type="text"
                                        id="channelName"
                                        value={newChannel.name}
                                        onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-white/30 bg-white/20 text-white placeholder-white/60 focus:outline-none focus:border-blue-400 text-lg"
                                        placeholder="مثال: beIN Sports HD"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-lg font-semibold text-white mb-4">
                                        <i className="fas fa-link ml-2"></i>
                                        روابط البث
                                    </label>
                                    {newChannel.urls.map((urlObj, index) => (
                                        <div key={index} className="flex items-end gap-3 mb-4">
                                            <div className="flex-grow">
                                                <label className="block text-sm font-medium text-white/80 mb-1">
                                                    رابط البث {index + 1}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={urlObj.url}
                                                    onChange={(e) => {
                                                        const newUrls = [...newChannel.urls];
                                                        newUrls[index].url = e.target.value;
                                                        setNewChannel({ ...newChannel, urls: newUrls });
                                                    }}
                                                    className="w-full px-4 py-3 rounded-lg border-2 border-white/30 bg-white/20 text-white placeholder-white/60 focus:outline-none focus:border-blue-400"
                                                    placeholder="https://example.com/stream"
                                                />
                                            </div>
                                            <div className="min-w-[100px]">
                                                <label className="block text-sm font-medium text-white/80 mb-1">الجودة</label>
                                                <select
                                                    value={urlObj.type}
                                                    onChange={(e) => {
                                                        const newUrls = [...newChannel.urls];
                                                        newUrls[index].type = e.target.value;
                                                        setNewChannel({ ...newChannel, urls: newUrls });
                                                    }}
                                                    className="w-full px-3 py-3 rounded-lg border-2 border-white/30 bg-white/20 text-white focus:outline-none focus:border-blue-400"
                                                >
                                                    <option value="HD" className="text-gray-800">HD</option>
                                                    <option value="FHD" className="text-gray-800">FHD</option>
                                                    <option value="4K" className="text-gray-800">4K</option>
                                                    <option value="SD" className="text-gray-800">SD</option>
                                                </select>
                                            </div>
                                            {newChannel.urls.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newUrls = newChannel.urls.filter((_, i) => i !== index);
                                                        setNewChannel({ ...newChannel, urls: newUrls });
                                                    }}
                                                    className="p-3 text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-red-500/20"
                                                >
                                                    <i className="fas fa-times-circle text-xl"></i>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                
                                <button
                                    type="button"
                                    onClick={() => setNewChannel({ ...newChannel, urls: [...newChannel.urls, { url: "", type: "HD" }] })}
                                    className="text-blue-300 hover:text-blue-200 transition-colors font-medium"
                                >
                                    <i className="fas fa-plus-circle ml-2"></i>
                                    أضف رابط آخر
                                </button>
                                
                                <button
                                    onClick={handleAddChannel}
                                    disabled={loading}
                                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                >
                                    {loading ? (
                                        <><i className="fas fa-spinner fa-spin ml-2"></i> جاري الإضافة...</>
                                    ) : (
                                        <><i className="fas fa-plus-circle ml-2"></i> إضافة القناة</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'manage' && (
                        <div className="space-y-8">
                            <div className="text-center">
                                <h2 className="text-3xl font-bold text-white mb-4">⚙️ إدارة القنوات الحالية</h2>
                                <p className="text-lg text-white opacity-90">عرض وحذف القنوات المحفوظة في النظام</p>
                            </div>
                            
                            <div className="bg-yellow-500/20 rounded-xl p-4 border border-yellow-400/30 text-center">
                                <i className="fas fa-exclamation-triangle text-yellow-300 text-xl ml-2"></i>
                                <span className="text-yellow-200 font-medium">
                                    تحذير: حذف قناة سيؤدي إلى إزالتها من جميع المباريات المرتبطة بها نهائياً
                                </span>
                            </div>
                            
                            <div className="grid gap-4 max-h-96 overflow-y-auto">
                                {channels.length > 0 ? (
                                    channels.map(channel => (
                                        <div key={channel.id} className="bg-white/20 rounded-xl p-6 border border-white/30 hover:bg-white/30 transition-all">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-grow">
                                                    <h3 className="text-xl font-bold text-white mb-2">
                                                        <i className="fas fa-broadcast-tower ml-2 text-blue-300"></i>
                                                        {channel.name}
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {channel.urls.map((url, index) => (
                                                            <div key={index} className="flex items-center gap-3 text-white/80">
                                                                <span className="bg-blue-500/30 px-2 py-1 rounded text-xs font-bold text-white">
                                                                    {url.type}
                                                                </span>
                                                                <span className="text-sm font-mono bg-black/20 px-2 py-1 rounded truncate max-w-md">
                                                                    {url.url}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3 text-white/60 text-sm">
                                                        <i className="fas fa-info-circle ml-1"></i>
                                                        {channel.urls.length} رابط مُضاف
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteChannel(channel.id, channel.name)}
                                                    disabled={loading}
                                                    className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ml-4"
                                                >
                                                    <i className="fas fa-trash-alt ml-1"></i>
                                                    حذف
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-16">
                                        <i className="fas fa-broadcast-tower text-6xl text-white/50 mb-4"></i>
                                        <p className="text-white text-xl font-semibold mb-2">لا توجد قنوات محفوظة بعد</p>
                                        <p className="text-white/80 mb-6">ابدأ بإضافة قناة جديدة من التبويب الثاني</p>
                                        <button
                                            onClick={() => setActiveTab('add')}
                                            className="btn-primary text-white px-6 py-3 rounded-lg font-medium"
                                        >
                                            <i className="fas fa-plus-circle ml-2"></i>
                                            إضافة أول قناة
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="mt-8 glass-effect rounded-2xl p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                        <div className="bg-white/10 rounded-xl p-4">
                            <i className="fas fa-futbol text-3xl text-blue-300 mb-2"></i>
                            <div className="text-2xl font-bold text-white">{stats.totalMatches}</div>
                            <div className="text-white/80 text-sm">إجمالي المباريات</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <i className="fas fa-link text-3xl text-green-300 mb-2"></i>
                            <div className="text-2xl font-bold text-white">{stats.linkedMatches}</div>
                            <div className="text-white/80 text-sm">مباريات مربوطة</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <i className="fas fa-broadcast-tower text-3xl text-purple-300 mb-2"></i>
                            <div className="text-2xl font-bold text-white">{stats.totalChannels}</div>
                            <div className="text-white/80 text-sm">قنوات متاحة</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <i className="fas fa-clock text-3xl text-yellow-300 mb-2"></i>
                            <div className="text-2xl font-bold text-white">يتم تحديثها تلقائيا</div>
                            <div className="text-white/80 text-sm">عبر Vercel Cron Jobs</div>
                        </div>
                    </div>
                </div>

                <footer className="mt-8 text-center text-white/60">
                    <div className="glass-effect rounded-xl p-4">
                        <p className="mb-2">
                            <i className="fas fa-code ml-2"></i>
                            لوحة إدارة متطورة مع نظام تحديث ذكي
                        </p>
                        <p className="text-sm">
                            آخر تحديث: قبل لحظات
                        </p>
                    </div>
                </footer>
            </div>
        </div>
    );
}

ReactDOM.render(React.createElement(AdminPanel), document.getElementById('root'));