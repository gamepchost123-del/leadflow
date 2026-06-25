'use client';

import { useState, useEffect } from 'react';

type FilterRule = {
  id: string;
  type: string;
  category: string;
  value: string;
  isActive: boolean;
};

const TABS = [
  { id: 'STAFFING_AGENCY', label: 'Uitzendbureaus' },
  { id: 'STAFFING_KEYWORD', label: 'Uitzend Keywords' },
  { id: 'JOB_BOARD', label: 'Job Boards' },
  { id: 'CHAIN', label: 'Grote Ketens' },
  { id: 'HORECA_LISTING', label: 'Horeca Platforms' },
];

export default function SettingsPage() {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('STAFFING_AGENCY');
  const [newValue, setNewValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/filters');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRules(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;

    setIsAdding(true);
    setError('');

    // Determine type based on category
    let type = 'DOMAIN';
    if (activeTab.includes('KEYWORD') || activeTab.includes('PATTERN')) type = 'KEYWORD';
    if (newValue.startsWith('/')) type = 'URL_PATTERN';

    try {
      const res = await fetch('/api/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          category: activeTab,
          value: newValue.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add rule');
      }

      setNewValue('');
      fetchRules(); // Refresh list
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    // Optimistic update
    setRules(rules.map(r => r.id === id ? { ...r, isActive: !currentStatus } : r));
    try {
      await fetch(`/api/filters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
    } catch (err) {
      // Revert on error
      setRules(rules.map(r => r.id === id ? { ...r, isActive: currentStatus } : r));
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze filterregel wilt verwijderen?')) return;
    
    setRules(rules.filter(r => r.id !== id));
    try {
      await fetch(`/api/filters/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error(err);
      fetchRules(); // Revert on error
    }
  };

  const filteredRules = rules.filter(r => {
    if (activeTab === 'STAFFING_KEYWORD') {
      return r.category === 'STAFFING_KEYWORD' || r.category === 'STAFFING_DOMAIN_PATTERN';
    }
    return r.category === activeTab;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Instellingen & Filters</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Beheer de domeinen, websites en zoekwoorden die de scraper automatisch moet negeren.
        </p>
      </div>

      <div className="flex gap-4 border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-2 font-medium transition-colors relative`}
            style={{
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      <div className="card-glass p-6">
        <form onSubmit={handleAddRule} className="mb-6 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Nieuwe waarde toevoegen (bijv. "randstad.nl" of "uitzendbureau")
            </label>
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Vul een domein of zoekwoord in..."
              className="input-field w-full"
              disabled={isAdding}
            />
          </div>
          <button type="submit" disabled={isAdding || !newValue.trim()} className="btn-primary">
            {isAdding ? 'Toevoegen...' : 'Toevoegen'}
          </button>
        </form>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <th className="py-3 px-4 font-medium">Waarde</th>
                  <th className="py-3 px-4 font-medium w-32">Type</th>
                  <th className="py-3 px-4 font-medium w-32 text-center">Actief</th>
                  <th className="py-3 px-4 font-medium w-20 text-right">Actie</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      Geen filters gevonden in deze categorie.
                    </td>
                  </tr>
                ) : (
                  filteredRules.map(rule => (
                    <tr key={rule.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 px-4 font-medium">{rule.value}</td>
                      <td className="py-3 px-4 text-xs">
                        <span className="px-2 py-1 rounded-full bg-white/5" style={{ color: 'var(--text-muted)' }}>
                          {rule.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleActive(rule.id, rule.isActive)}
                          className={`w-10 h-5 rounded-full relative transition-colors ${rule.isActive ? 'bg-blue-500' : 'bg-gray-600'}`}
                        >
                          <span className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${rule.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          title="Verwijderen"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
