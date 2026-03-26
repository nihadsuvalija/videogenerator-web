import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clapperboard, History, Zap, Sliders,
  FolderOpen, ImagePlus, Home, LogOut, Sparkles, UserCircle, CreditCard, BookOpen, Music,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import AuthPage from './components/AuthPage';
import HomePage from './components/HomePage';
import BatchManager from './components/BatchManager';
import GeneratePanel from './components/GeneratePanel';
import JobHistory from './components/JobHistory';
import PostsPanel from './components/PostsPanel';
import PresetsPanel from './components/PresetsPanel';
import MetadataGenerator from './components/MetadataGenerator';
import ProfilePanel from './components/ProfilePanel';
import PricingPanel from './components/PricingPanel';
import QuotesPanel from './components/QuotesPanel';
import AudioBatchesPanel from './components/AudioBatchesPanel';
import Toast from './components/Toast';
import { cn } from './lib/utils';

const API = 'http://localhost:5001';

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();

  const [batches, setBatches]                       = useState([]);
  const [selectedBatch, setSelectedBatch]           = useState(null);
  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0);
  const [activePreset, setActivePreset]             = useState(null);
  const [presets, setPresets]                       = useState([]);
  const [postPresets, setPostPresets]               = useState([]);
  const [toasts, setToasts]                         = useState([]);
  const [homeRefresh, setHomeRefresh]               = useState(0);
  const tabRefs                                     = useRef({});

  // ── Hash-based tab routing so browser Back/Forward works ──────────────────
  const VALID_TABS = ['home','generate','posts','metadata','batches','presets','history','profile','pricing','quotes','audio'];
  const getTabFromHash = () => {
    const hash = window.location.hash.replace('#', '');
    return VALID_TABS.includes(hash) ? hash : 'home';
  };
  const [activeTab, setActiveTabState] = useState(getTabFromHash);

  const setActiveTab = useCallback((tab) => {
    if (tab === activeTab) return;
    window.location.hash = tab;
  }, [activeTab]);

  useEffect(() => {
    const onHashChange = () => {
      const tab = getTabFromHash();
      if (tab === 'batches') setSelectedBatch(null);
      setActiveTabState(tab);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const loadBatches = async () => {
    const res = await fetch(`${API}/api/batches`);
    setBatches(await res.json());
  };

  const handleFilesChanged = () => {
    setFileRefreshTrigger(n => n + 1);
    loadBatches();
  };

  const handleApplyPreset = async (preset) => {
    setActiveTab(preset.presetType === 'post' ? 'posts' : 'generate');
    try {
      const res = await fetch(`${API}/api/presets/${preset.id}`);
      const fresh = await res.json();
      setActivePreset(fresh);
      setPresets(prev => prev.map(p => p.id === fresh.id ? fresh : p));
    } catch {
      setActivePreset(preset);
      setPresets(prev => prev.map(p => p.id === preset.id ? preset : p));
    }
  };

  const handlePresetUpdated = (patch) => {
    if (!activePreset) return;
    setActivePreset(prev => ({ ...prev, ...patch }));
  };

  const handleJobComplete = useCallback((job) => {
    const id = Date.now();
    if (job.status === 'done') {
      setToasts(prev => [...prev, {
        id, type: 'success', title: 'Video ready!',
        message: job.batchName, outputFile: job.outputFile,
      }]);
    } else if (job.status === 'error') {
      setToasts(prev => [...prev, {
        id, type: 'error', title: 'Generation failed', message: job.batchName,
      }]);
    }
    setHomeRefresh(n => n + 1);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const loadPresets = useCallback(async () => {
    try {
      const [vRes, pRes] = await Promise.all([
        fetch(`${API}/api/presets?type=video`),
        fetch(`${API}/api/presets?type=post`),
      ]);
      setPresets(await vRes.json());
      setPostPresets(await pRes.json());
    } catch {}
  }, []);

  // On first mount after login, set hash if missing
  useEffect(() => {
    if (user && !window.location.hash) window.location.hash = 'home';
  }, [user]);

  useEffect(() => { loadBatches(); loadPresets(); }, []);

  // Re-trigger tab-enter animation without remounting
  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (!el) return;
    el.classList.remove('tab-enter');
    void el.offsetWidth;
    el.classList.add('tab-enter');
  }, [activeTab]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const creationTabs = [
    { id: 'home',     icon: <Home className="w-4 h-4" />,      label: 'Home' },
    { id: 'generate', icon: <Zap className="w-4 h-4" />,       label: 'Video' },
    { id: 'posts',    icon: <ImagePlus className="w-4 h-4" />,  label: 'Posts' },
    { id: 'quotes',   icon: <BookOpen className="w-4 h-4" />,  label: 'Quotes' },
    { id: 'metadata', icon: <Sparkles className="w-4 h-4" />,  label: 'Metadata' },
  ];

  const utilityTabs = [
    { id: 'batches',  icon: <FolderOpen className="w-4 h-4" />, label: 'Batches' },
    { id: 'audio',    icon: <Music className="w-4 h-4" />,      label: 'Audio' },
    { id: 'presets',  icon: <Sliders className="w-4 h-4" />,    label: 'Presets' },
    { id: 'history',  icon: <History className="w-4 h-4" />,    label: 'History' },
  ];

  return (
    <div className="h-screen overflow-hidden bg-background flex">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* ── Sidebar ── */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-border bg-background sticky top-0 h-screen">

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Clapperboard className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold tracking-tight" style={{ fontFamily: 'Syne' }}>
            Batch<span className="text-primary">lyst</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">

          {/* Creation group */}
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            Create
          </p>
          {creationTabs.map(t => (
            <SideNavItem key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} icon={t.icon}>
              {t.label}
            </SideNavItem>
          ))}

          {/* Divider */}
          <div className="my-2 h-px bg-border" />

          {/* Utility group */}
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            Manage
          </p>
          {utilityTabs.map(t => (
            <SideNavItem key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} icon={t.icon}>
              {t.label}
            </SideNavItem>
          ))}

          {/* Divider */}
          <div className="my-2 h-px bg-border" />

          {/* Billing group */}
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            Billing
          </p>
          <SideNavItem active={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')} icon={<CreditCard className="w-4 h-4" />}>
            Pricing
          </SideNavItem>
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3 flex-shrink-0">
          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              "w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-all mb-1",
              activeTab === 'profile'
                ? "bg-primary/10 ring-1 ring-primary/20"
                : "hover:bg-secondary"
            )}
          >
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground flex-shrink-0">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 text-left">
              <p className={cn("text-xs font-semibold truncate", activeTab === 'profile' ? "text-primary" : "")}>{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <main className="flex-1 px-8 py-8 overflow-y-auto">

          <div ref={el => tabRefs.current['home'] = el} style={{ display: activeTab === 'home' ? '' : 'none' }}>
            <HomePage user={user} onNavigate={setActiveTab} refreshTrigger={homeRefresh} />
          </div>

          <div ref={el => tabRefs.current['generate'] = el} style={{ display: activeTab === 'generate' ? '' : 'none' }}>
            <SectionHeader icon={<Zap className="w-4 h-4 text-primary" />} label="Video Generation" />
            <GeneratePanel
              selectedBatch={selectedBatch}
              onSelectBatch={setSelectedBatch}
              batches={batches}
              fileRefreshTrigger={fileRefreshTrigger}
              activePreset={activePreset}
              onPresetUpdated={handlePresetUpdated}
              onClearPreset={() => setActivePreset(null)}
              onJobComplete={handleJobComplete}
              presets={presets}
              onApplyPreset={handleApplyPreset}
            />
          </div>

          <div ref={el => tabRefs.current['posts'] = el} style={{ display: activeTab === 'posts' ? '' : 'none' }}>
            <SectionHeader icon={<ImagePlus className="w-4 h-4 text-primary" />} label="Posts" />
            <PostsPanel
              batches={batches}
              incomingPreset={activePreset?.presetType === 'post' ? activePreset : null}
              onClearIncomingPreset={() => setActivePreset(null)}
              presets={postPresets}
              onPresetsChanged={loadPresets}
            />
          </div>

          <div ref={el => tabRefs.current['quotes'] = el} style={{ display: activeTab === 'quotes' ? '' : 'none' }}>
            <div className="max-w-2xl mx-auto">
              <SectionHeader icon={<BookOpen className="w-4 h-4 text-primary" />} label="Quotes" />
              <QuotesPanel />
            </div>
          </div>

          <div ref={el => tabRefs.current['metadata'] = el} style={{ display: activeTab === 'metadata' ? '' : 'none' }}>
            <div className="max-w-4xl mx-auto">
              <SectionHeader icon={<Sparkles className="w-4 h-4 text-primary" />} label="Metadata" />
              <MetadataGenerator />
            </div>
          </div>

          <div ref={el => tabRefs.current['batches'] = el} style={{ display: activeTab === 'batches' ? '' : 'none' }}>
            <div className="max-w-4xl mx-auto">
              <SectionHeader icon={<FolderOpen className="w-4 h-4 text-primary" />} label="Batches" />
              <BatchManager
                batches={batches}
                onRefresh={loadBatches}
                onSelectBatch={setSelectedBatch}
                selectedBatch={selectedBatch}
                onFilesChanged={handleFilesChanged}
              />
            </div>
          </div>

          <div ref={el => tabRefs.current['audio'] = el} style={{ display: activeTab === 'audio' ? '' : 'none' }}>
            <div className="max-w-3xl mx-auto">
              <SectionHeader icon={<Music className="w-4 h-4 text-primary" />} label="Audio Batches" />
              <AudioBatchesPanel />
            </div>
          </div>

          <div ref={el => tabRefs.current['presets'] = el} style={{ display: activeTab === 'presets' ? '' : 'none' }}>
            <div className="max-w-[1400px] mx-auto">
              <SectionHeader icon={<Sliders className="w-4 h-4 text-primary" />} label="Presets" />
              <PresetsPanel onApplyPreset={handleApplyPreset} onPresetsChanged={loadPresets} />
            </div>
          </div>

          <div ref={el => tabRefs.current['history'] = el} style={{ display: activeTab === 'history' ? '' : 'none' }}>
            <div className="max-w-5xl mx-auto">
              <SectionHeader icon={<History className="w-4 h-4 text-primary" />} label="Job History" />
              <JobHistory />
            </div>
          </div>

          <div ref={el => tabRefs.current['profile'] = el} style={{ display: activeTab === 'profile' ? '' : 'none' }}>
            <div className="max-w-2xl mx-auto">
              <SectionHeader icon={<UserCircle className="w-4 h-4 text-primary" />} label="Profile" />
              <ProfilePanel />
            </div>
          </div>

          <div ref={el => tabRefs.current['pricing'] = el} style={{ display: activeTab === 'pricing' ? '' : 'none' }}>
            <div className="max-w-3xl mx-auto">
              <SectionHeader icon={<CreditCard className="w-4 h-4 text-primary" />} label="Pricing" />
              <PricingPanel />
            </div>
          </div>

        </main>
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
    </div>
  );
}

function SideNavItem({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all text-left",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function SectionHeader({ icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{label}</h2>
    </div>
  );
}
