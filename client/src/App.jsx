import React, { useState, useEffect } from 'react';
import { Clapperboard, Layers, History, Zap, Sparkles, Sliders, Film } from 'lucide-react';
import BatchManager from './components/BatchManager';
import GeneratePanel from './components/GeneratePanel';
import JobHistory from './components/JobHistory';
import MetadataGenerator from './components/MetadataGenerator';
import PresetsPanel from './components/PresetsPanel';
import VideoEditor from './components/VideoEditor';
import { cn } from './lib/utils';

const API = 'http://localhost:5001';

export default function App() {
  const [batches, setBatches]                       = useState([]);
  const [selectedBatch, setSelectedBatch]           = useState(null);
  const [activeTab, setActiveTab]                   = useState('generate');
  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0);
  const [activePreset, setActivePreset]             = useState(null);
  const [editorJobId, setEditorJobId]               = useState(null);

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
    setActiveTab('generate');
  };

  const handlePresetUpdated = (patch) => {
    if (!activePreset) return;
    setActivePreset(prev => ({ ...prev, ...patch }));
  };

  const handleOpenEditor = (jobId) => {
    setEditorJobId(jobId);
    setActiveTab('editor');
  };

  useEffect(() => { loadBatches(); }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight" style={{ fontFamily: 'Syne' }}>
                VideoGen <span className="text-primary">Studio</span>
              </h1>
              <p className="text-xs text-muted-foreground -mt-0.5">MERN · FFmpeg · Batch Processing</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            <TabButton active={activeTab === 'generate'} onClick={() => setActiveTab('generate')}>
              <Zap className="w-3.5 h-3.5" /> Generate
            </TabButton>
            <TabButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')}>
              <Film className="w-3.5 h-3.5" /> Editor
              {editorJobId && <span className="w-1.5 h-1.5 rounded-full bg-primary ml-0.5" />}
            </TabButton>
            <TabButton active={activeTab === 'presets'} onClick={() => setActiveTab('presets')}>
              <Sliders className="w-3.5 h-3.5" /> Presets
            </TabButton>
            <TabButton active={activeTab === 'metadata'} onClick={() => setActiveTab('metadata')}>
              <Sparkles className="w-3.5 h-3.5" /> Metadata
            </TabButton>
            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
              <History className="w-3.5 h-3.5" /> History
            </TabButton>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Batches</h2>
              </div>
              <BatchManager
                batches={batches}
                onRefresh={loadBatches}
                onSelectBatch={setSelectedBatch}
                selectedBatch={selectedBatch}
                onFilesChanged={handleFilesChanged}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clapperboard className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Generate</h2>
              </div>
              <GeneratePanel
                selectedBatch={selectedBatch}
                fileRefreshTrigger={fileRefreshTrigger}
                activePreset={activePreset}
                onPresetUpdated={handlePresetUpdated}
                onClearPreset={() => setActivePreset(null)}
              />
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Film className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Video Editor</h2>
            </div>
            {editorJobId ? (
              <VideoEditor
                jobId={editorJobId}
                onBack={() => { setEditorJobId(null); setActiveTab('history'); }}
              />
            ) : (
              <div className="text-center py-20 text-muted-foreground">
                <Film className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">No video loaded.</p>
                <p className="text-xs mt-1 opacity-60">Go to History and click <strong>Edit</strong> on a completed job.</p>
                <button
                  onClick={() => setActiveTab('history')}
                  className="mt-4 text-sm text-primary hover:underline"
                >
                  Open History →
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'presets' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Presets</h2>
            </div>
            <PresetsPanel onApplyPreset={handleApplyPreset} />
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">AI Metadata</h2>
            </div>
            <MetadataGenerator />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Job History</h2>
            </div>
            <JobHistory onOpenEditor={handleOpenEditor} />
          </div>
        )}
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
