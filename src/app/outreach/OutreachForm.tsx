'use client';

import { useState, useEffect } from 'react';

export default function OutreachForm({ lead }: { lead: any }) {
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(lead.email || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    // Generate default template on load
    const generateTemplate = () => {
      setIsGenerating(true);
      setTimeout(() => {
        const defaultSubject = `Interesse in de openstaande vacature voor ${lead.vacancyTitle || 'jouw bedrijf'}`;
        const defaultBody = `Beste ondernemer van ${lead.companyName},\n\nIk zag zojuist dat jullie op zoek zijn naar een ${lead.vacancyTitle || 'nieuwe medewerker'}. In de huidige markt kan het vinden van de juiste kandidaat veel tijd en energie kosten voor een MKB-bedrijf.\n\nWij zijn gespecialiseerd in het snel en efficiënt werven van personeel voor bedrijven zoals ${lead.companyName}. We hebben een pool van gekwalificeerde kandidaten en nemen het hele wervingsproces uit handen, zodat jullie je kunnen focussen op de dagelijkse gang van zaken.\n\nZullen we deze week kort telefonisch kennismaken om te bespreken hoe we jullie kunnen helpen deze vacature snel in te vullen?\n\nMet vriendelijke groet,\n\nJonathan\nRecruitment Specialist`;
        
        setEmailSubject(defaultSubject);
        setEmailBody(defaultBody);
        setRecipientEmail(lead.email || '');
        setIsGenerating(false);
      }, 800);
    };

    generateTemplate();
    setStatus(null);
  }, [lead]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail) {
      setStatus({ type: 'error', message: 'Voeg een e-mailadres toe om te verzenden.' });
      return;
    }

    setIsSending(true);
    setStatus(null);

    try {
      const response = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          to: recipientEmail,
          subject: emailSubject,
          body: emailBody,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: 'E-mail succesvol verzonden! De status van de lead is geüpdatet.' });
      } else {
        setStatus({ type: 'error', message: data.error || 'Er ging iets mis bij het verzenden.' });
      }
    } catch (error) {
      setStatus({ type: 'error', message: 'Er ging iets mis bij het verzenden.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSend} className="space-y-5 animate-in fade-in duration-300">
      {status && (
        <div className={`p-4 rounded-lg mb-4 text-sm font-medium ${status.type === 'success' ? 'bg-[rgba(16,185,129,0.1)] text-[var(--accent-green)] border border-[rgba(16,185,129,0.3)]' : 'bg-[rgba(239,68,68,0.1)] text-[var(--accent-red)] border border-[rgba(239,68,68,0.3)]'}`}>
          {status.message}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">Aan (E-mail)</label>
        <input 
          type="email" 
          className="input" 
          placeholder="E-mailadres van de contactpersoon" 
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
        />
        {!lead.email && !recipientEmail && (
          <p className="text-xs text-[var(--accent-orange)] mt-1">Geen e-mailadres gevonden. Zoek deze handmatig op via de website.</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">Onderwerp</label>
        {isGenerating ? (
          <div className="skeleton h-[42px] w-full rounded-lg"></div>
        ) : (
          <input 
            type="text" 
            className="input" 
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            required
          />
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-[var(--text-muted)]">Bericht</label>
          <button 
            type="button" 
            className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1"
            onClick={() => {
              // Simulate AI rewrite
              setIsGenerating(true);
              setTimeout(() => {
                setEmailBody(`Beste ${lead.companyName} team,\n\nIk zie dat jullie momenteel een vacature hebben voor een ${lead.vacancyTitle || 'medewerker'}. Gefeliciteerd met jullie groei!\n\nWij begrijpen dat het vinden van goed personeel een uitdaging kan zijn. Als wervingsbureau voor het MKB helpen we bedrijven zoals dat van jullie om snel en adequaat de juiste mensen te vinden, zonder dat het jullie kostbare tijd kost.\n\nStaan jullie open voor een korte telefonische kennismaking van 10 minuten om te kijken of we iets voor elkaar kunnen betekenen?\n\nHoor graag van jullie.\n\nGroet,\nJonathan`);
                setIsGenerating(false);
              }, 1200);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path><line x1="16" y1="5" x2="22" y2="5"></line><line x1="19" y1="2" x2="19" y2="8"></line><circle cx="9" cy="9" r="2"></circle><path d="M15 13l-3-3-4 4"></path></svg>
            Herschrijven met AI
          </button>
        </div>
        
        {isGenerating ? (
          <div className="skeleton h-[200px] w-full rounded-lg"></div>
        ) : (
          <textarea 
            className="input" 
            rows={10}
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            required
          ></textarea>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={isSending || isGenerating || !recipientEmail}
        >
          {isSending ? (
             <>
               <div className="pulse-dot bg-white"></div>
               <div className="pulse-dot bg-white" style={{ animationDelay: '0.2s' }}></div>
               <div className="pulse-dot bg-white" style={{ animationDelay: '0.4s' }}></div>
             </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              Verzenden
            </>
          )}
        </button>
      </div>
    </form>
  );
}
