'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';

export default function DashboardCharts() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [automationResult, setAutomationResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const handleRunAutomation = async () => {
    setProcessing(true);
    setAutomationResult(null);
    try {
      const res = await fetch('/api/cron/followups');
      const result = await res.json();
      setAutomationResult(result);
    } catch (err: any) {
      setAutomationResult({ error: err.message });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="card h-80 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Automation Widget */}
      <div className="card-glass border-l-4 border-blue-500 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="font-bold flex items-center gap-2">
            <span className="text-blue-500">⚡</span> Automatische E-mail Campagnes
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Start de background-worker om direct openstaande follow-up e-mails te versturen.
          </p>
        </div>
        <div className="flex flex-col items-end">
          <button 
            onClick={handleRunAutomation} 
            disabled={processing}
            className="btn-primary shadow-lg shadow-blue-500/20"
          >
            {processing ? 'Bezig met scannen...' : 'Start Automatisering Nu'}
          </button>
          {automationResult && (
            <p className="text-xs mt-2 font-medium" style={{ color: automationResult.error ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
              {automationResult.error 
                ? `Fout: ${automationResult.error}` 
                : `${automationResult.processed} follow-ups succesvol verstuurd.`}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Acquisition Chart */}
        <div className="card">
          <h3 className="font-bold mb-6 text-sm uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Nieuwe Leads (Laatste 14 dagen)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMkb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorHoreca" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e11d48" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#e11d48" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dateStr" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" name="MKB Leads" dataKey="mkb" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorMkb)" />
                <Area type="monotone" name="Horeca Leads" dataKey="horeca" stroke="#e11d48" strokeWidth={3} fillOpacity={1} fill="url(#colorHoreca)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Outreach Volume Chart */}
        <div className="card">
          <h3 className="font-bold mb-6 text-sm uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            E-mails Verstuurd (Laatste 14 dagen)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dateStr" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}
                />
                <Bar name="Verstuurde Mails" dataKey="emails" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
