'use client';

import { useState } from 'react';

interface FollowUp {
  id: string;
  leadId: string;
  subject: string | null;
  content: string | null;
  followUpDate: string | null;
  sentAt: string;
  lead: {
    id: string;
    companyName: string;
    email: string | null;
    vacancyTitle: string | null;
  };
}

export default function FollowUpSection({ followUps }: { followUps: FollowUp[] }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleSendAll = async () => {
    setSending(true);
    setError(null);

    const ids = followUps
      .filter((fu) => !sent.has(fu.id) && fu.lead.email)
      .map((fu) => fu.id);

    try {
      const res = await fetch('/api/outreach/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreachIds: ids }),
      });

      const data = await res.json();
      if (data.success) {
        const newSent = new Set(sent);
        ids.forEach((id) => newSent.add(id));
        setSent(newSent);
      } else {
        setError(data.error || 'Er ging iets mis.');
      }
    } catch {
      setError('Kan niet verbinden met de server.');
    } finally {
      setSending(false);
    }
  };

  const handleSendOne = async (outreachId: string) => {
    try {
      const res = await fetch('/api/outreach/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreachIds: [outreachId] }),
      });

      const data = await res.json();
      if (data.success) {
        setSent((prev) => new Set([...prev, outreachId]));
      }
    } catch {
      setError('Verzenden mislukt.');
    }
  };

  const pendingCount = followUps.filter((fu) => !sent.has(fu.id)).length;

  if (pendingCount === 0 && sent.size > 0) {
    return (
      <div className="card-glass mb-8 border-l-4 border-[var(--accent-green)]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <h3 className="font-bold text-[var(--accent-green)]">
              Alle follow-ups verzonden!
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              {sent.size} follow-up mail(s) succesvol verzonden.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass mb-8 border-l-4 border-[var(--accent-orange)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📬</span>
          <div>
            <h3 className="font-bold text-[var(--accent-orange)]">
              Follow-ups vandaag ({pendingCount})
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              Deze leads zijn 7-10 werkdagen geleden benaderd en hebben nog niet gereageerd.
            </p>
          </div>
        </div>
        {pendingCount > 1 && (
          <button
            className="btn text-white text-sm"
            style={{ background: 'var(--gradient-warm)' }}
            onClick={handleSendAll}
            disabled={sending}
          >
            {sending ? (
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Verzenden...
              </span>
            ) : (
              `Alle ${pendingCount} follow-ups versturen`
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-[var(--accent-red)] mb-3">{error}</div>
      )}

      <div className="space-y-2">
        {followUps.map((fu) => {
          const isSent = sent.has(fu.id);
          const daysAgo = Math.floor(
            (Date.now() - new Date(fu.sentAt).getTime()) / (1000 * 60 * 60 * 24)
          );

          return (
            <div
              key={fu.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                isSent
                  ? 'border-[var(--accent-green)] bg-[rgba(16,185,129,0.05)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{isSent ? '✅' : '📧'}</span>
                <div>
                  <span className="font-semibold text-sm text-[var(--text-primary)]">
                    {fu.lead.companyName}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      {fu.lead.email}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">•</span>
                    <span className="text-xs text-[var(--accent-orange)]">
                      {daysAgo} dagen geleden benaderd
                    </span>
                  </div>
                </div>
              </div>
              <div>
                {isSent ? (
                  <span className="text-xs text-[var(--accent-green)] font-semibold">
                    Verzonden ✓
                  </span>
                ) : (
                  <button
                    className="btn btn-sm text-white text-xs"
                    style={{ background: 'var(--gradient-warm)' }}
                    onClick={() => handleSendOne(fu.id)}
                  >
                    Follow-up sturen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
