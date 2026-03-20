import React, { useState, useEffect, useCallback } from 'react';
import {
  Clapperboard, History, Zap, Sliders,
  FolderOpen, ImagePlus, Home, LogOut, ChevronDown,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import AuthPage from './components/AuthPage';
import HomePage from './components/HomePage';
import BatchManager from './components/BatchManager';
import GeneratePanel from './components/GeneratePanel';
import JobHistory from './components/JobHistory';
import PostsPanel from './components/PostsPanel';
import PresetsPanel from './components/PresetsPanel';
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
  const [toasts, setToasts]                         = useState([]);
  const [userMenuOpen, setUserMenuOpen]             = useState(false);

  // ── Hash-based tab routing so browser Back/Forward works ──────────────────
  const VALID_TABS = ['home','generate','posts','batches','presets','history'];
  const getTabFromHash = () => {
    const hash = window.location.hash.replace('#', '');
    return VALID_TABS.includes(hash) ? hash : 'home';
  };
  const [activeTab, setActiveTabState] = useState(getTabFromHash);

  const setActiveTab = useCallback((tab) => {
    if (tab === activeTab) return;
    window.location.hash = tab;
    // hashchange listener will update state
  }, [activeTab]);

  useEffect(() => {
    const onHashChange = () => setActiveTabState(getTabFromHash());
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

  const handleApplyPreset = (preset) => {
    setActivePreset(preset);
    setActiveTab(preset.presetType === 'post' ? 'posts' : 'generate');
    setPresets(prev => prev.map(p => p.id === preset.id ? preset : p));
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
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const loadPresets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/presets?type=video`);
      setPresets(await res.json());
    } catch {}
  }, []);


  // On first mount after login, set hash if missing
  useEffect(() => {
    if (user && !window.location.hash) window.location.hash = 'home';
  }, [user]);

  useEffect(() => { loadBatches(); loadPresets(); }, []);

  // While auth is loading, show blank
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in — show auth page
  if (!user) return <AuthPage />;

  // ── Creation tabs (left nav group)
  const creationTabs = [
    { id: 'home',     icon: <Home className="w-3.5 h-3.5" />,      label: 'Home' },
    { id: 'generate', icon: <Zap className="w-3.5 h-3.5" />,       label: 'Video' },
    { id: 'posts',    icon: <ImagePlus className="w-3.5 h-3.5" />,  label: 'Posts' },
  ];

  // ── Utility tabs (right nav group)
  const utilityTabs = [
    { id: 'batches',  icon: <FolderOpen className="w-3.5 h-3.5" />, label: 'Batches' },
    { id: 'presets',  icon: <Sliders className="w-3.5 h-3.5" />,    label: 'Presets' },
    { id: 'history',  icon: <History className="w-3.5 h-3.5" />,    label: 'History' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* ── Header ── */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-md [will-change:transform]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Clapperboard className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight hidden sm:block" style={{ fontFamily: 'Syne' }}>
              Batch<span className="text-primary">lyst</span>
            </span>
          </div>

          {/* ── Left nav group: Home / Video / Posts ── */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
            {creationTabs.map(t => (
              <TabButton key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
                {t.icon} {t.label}
              </TabButton>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-border flex-shrink-0" />

          {/* ── Right nav group: utilities ── */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
            {utilityTabs.map(t => (
              <TabButton key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
                {t.dot && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </TabButton>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User avatar + menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {user.name?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="hidden sm:block font-medium">{user.name?.split(' ')[0]}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-card border border-border rounded-lg shadow-xl py-1 z-50 dropdown-in">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => { logout(); setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Close user menu on outside click */}
      {userMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
      )}

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div key={activeTab} className="tab-enter">

        {activeTab === 'home' && (
          <HomePage
            user={user}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'generate' && (
          <div className="max-w-7xl mx-auto">
            <SectionHeader icon={<Zap className="w-4 h-4 text-primary" />} label="Video Generation" />
            <GeneratePanel
              selectedBatch={selectedBatch}
              fileRefreshTrigger={fileRefreshTrigger}
              activePreset={activePreset}
              onPresetUpdated={handlePresetUpdated}
              onClearPreset={() => setActivePreset(null)}
              onJobComplete={handleJobComplete}
              presets={presets}
              onApplyPreset={handleApplyPreset}
              onOpenBatches={() => setActiveTab('batches')}
            />
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="max-w-7xl mx-auto">
            <SectionHeader icon={<ImagePlus className="w-4 h-4 text-primary" />} label="Posts" />
            <PostsPanel
              batches={batches}
              onOpenBatches={() => setActiveTab('batches')}
              incomingPreset={activePreset?.presetType === 'post' ? activePreset : null}
              onClearIncomingPreset={() => setActivePreset(null)}
            />
          </div>
        )}

        {activeTab === 'batches' && (
          <div className="max-w-2xl mx-auto">
            <SectionHeader icon={<FolderOpen className="w-4 h-4 text-primary" />} label="Batches" />
            <BatchManager
              batches={batches}
              onRefresh={loadBatches}
              onSelectBatch={setSelectedBatch}
              selectedBatch={selectedBatch}
              onFilesChanged={handleFilesChanged}
            />
          </div>
        )}

        {activeTab === 'presets' && (
          <div className="max-w-4xl mx-auto">
            <SectionHeader icon={<Sliders className="w-4 h-4 text-primary" />} label="Presets" />
            <PresetsPanel onApplyPreset={handleApplyPreset} onPresetsChanged={loadPresets} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-3xl mx-auto">
            <SectionHeader icon={<History className="w-4 h-4 text-primary" />} label="Job History" />
            <JobHistory />
          </div>
        )}

        </div>{/* end tab-enter wrapper */}
      </main>

      <div className="fixed bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
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
