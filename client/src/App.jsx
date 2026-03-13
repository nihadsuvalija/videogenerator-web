import React, { useState, useEffect } from 'react';
import { Clapperboard, Layers, History, Zap, Sparkles } from 'lucide-react';
import BatchManager from './components/BatchManager';
import GeneratePanel from './components/GeneratePanel';
import JobHistory from './components/JobHistory';
import MetadataGenerator from './components/MetadataGenerator';
import { cn } from './lib/utils';

const API = 'http://localhost:5001';

export default function App() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [activeTab, setActiveTab] = useState('generate');
  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0);

  const loadBatches = async () => {
    const res = await fetch(`${API}/api/batches`);
    const data = await res.json();
    setBatches(data);
  };

  const handleFilesChanged = () => {
    setFileRefreshTrigger(n => n + 1);
    loadBatches(); // also refresh batch counts in sidebar
  };

  useEffect(() => { loadBatches(); }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
            {/* Left: Batch manager */}
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

            {/* Right: Generate config */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clapperboard className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Generate</h2>
              </div>
              <GeneratePanel selectedBatch={selectedBatch} fileRefreshTrigger={fileRefreshTrigger} />
            </div>
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
            <JobHistory />
          </div>
        )}
      </main>

      {/* Subtle bottom accent */}
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
