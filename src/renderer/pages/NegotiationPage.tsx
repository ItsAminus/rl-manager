import {clauseTerms} from '../../game/deal-terms';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { RatingBadge } from '../components/RatingBadge';
import { contractOfferScore, transferWindow } from '../../game/career-rules';
import { Player } from '../../types';
import './NegotiationPage.css';

interface DialogueMessage {
  sender: 'agent' | 'player' | 'manager';
  text: string;
  time: string;
}

export const NegotiationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { team, career, currentDate, roster, reloadRoster } = useCareerStore();

  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const market = transferWindow(currentDate,career?.transferWindows);
  const [saveError, setSaveError] = useState('');
  const [quote, setQuote] = useState<any>(null);

  const [clauses,setClauses]=useState({profitPercent:0,contributionPercent:0,contributionMonths:0,buybackFee:0,playingTime:60});
  // Agent State
  const [agentName, setAgentName] = useState<string>('Vincent Laurent');
  const [patience, setPatience] = useState<number>(100);
  const [mood, setMood] = useState<'optimistic' | 'neutral' | 'skeptical' | 'frustrated' | 'furious'>('optimistic');
  const [targetWage, setTargetWage] = useState<number>(10000);
  const [targetBonus, setTargetBonus] = useState<number>(25000);
  const [minAcceptableWage, setMinAcceptableWage] = useState<number>(8500);

  // Manager Offer Terms
  const [offeredWage, setOfferedWage] = useState<number>(10000);
  const [offeredDuration, setOfferedDuration] = useState<number>(24); // months
  const [offeredBonus, setOfferedBonus] = useState<number>(20000);
  const [offeredBuyout, setOfferedBuyout] = useState<number>(150000);
  const [offeredRole, setOfferedRole] = useState<'Star Carry' | 'Core Starter' | 'Substitute'>('Core Starter');

  // Dialogue & State
  const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
  const [dealStatus, setDealStatus] = useState<'ongoing' | 'signed' | 'collapsed'>('ongoing');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      setQuote(null);
      setSaveError('');
      setDealStatus('ongoing');
      try {
        let p: Player | null = null;
        if (window.api?.players) {
          p = await window.api.players.getById(id);
        }
        if (!p) {
          p = roster.find((r) => r.id === id) || null;
        }

        if (p) {
          setPlayer(p);
          if (!career) throw new Error('Load a career before negotiating.');
          const pricing = await window.api.management.signingQuote(career.id, p.id);
          if (!pricing.success) throw new Error(pricing.error);
          setQuote(pricing);
          setPatience(100);
          setMood(pricing.interest?.willing===false?'skeptical':'neutral');
          setOfferedRole(pricing.approach?.role||'Core Starter');
          const targetW = pricing.demands.salary;
          const minW = Math.round(targetW * 0.88);
          const targetB = pricing.demands.bonus;

          setTargetWage(targetW);
          setMinAcceptableWage(minW);
          setTargetBonus(targetB);
          setOfferedWage(Math.round(targetW * 0.9));
          setOfferedBonus(Math.round(targetB * 0.8));
          setOfferedBuyout(targetW * 20);

          // Agent name generator
          const agents = ['Matthias Vance', 'Claire Moreau', 'Julian Drake', 'Antoine Royer', 'Sven Lindholm'];
          const chosenAgent = agents[Array.from(p.id).reduce((n,c)=>n+c.charCodeAt(0),0) % agents.length];
          setAgentName(chosenAgent);

          // Initial greeting
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setDialogue([
            {
              sender: 'agent',
              text: pricing.unavailableReason||`I represent ${p.gamertag}. ${pricing.interest?.explanation||'We can discuss terms.'}`,
              time: nowStr,
            },
            {
              sender: 'player',
              text: pricing.interest?.willing===false?'Money alone will not make this the right move for my career.':'I need the right sporting project, a credible role and a secure contract. No agreement is guaranteed.',
              time: nowStr,
            },
          ]);
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
        console.error('Failed to load player for negotiation', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, career?.id, currentDate]);

  const addMessage = (sender: 'agent' | 'player' | 'manager', text: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setDialogue((prev) => [...prev, { sender, text, time }]);
  };

  const handleCounterOffer = () => {
    if (!player || dealStatus !== 'ongoing' || submitting || !market.open || quote?.unavailableReason) return;
    setSubmitting(true);

    setSaveError('');
    addMessage(
      'manager',
      `We offer $${offeredWage.toLocaleString()}/mo on a ${offeredDuration / 12}-year contract with a $${offeredBonus.toLocaleString()} signing bonus as a ${offeredRole}.`
    );

    // Evaluate offer
    setTimeout(async () => {
      const overallScore = contractOfferScore({ salary: offeredWage, bonus: offeredBonus }, { salary: targetWage, bonus: targetBonus });

      if (overallScore >= 0.95) {
        await finalizeSignedContract();
      } else if (overallScore >= 0.82) {
        // CLOSE COUNTER
        const newPatience = Math.max(0, patience - 12);
        setPatience(newPatience);
        setMood('skeptical');
        addMessage(
          'agent',
          `You're in the ballpark, but still short. We are looking for at least $${minAcceptableWage.toLocaleString()}/mo with a proper signing bonus.`
        );
        addMessage('player', `I need to feel valued if I'm committing my prime competitive years here.`);
        if (newPatience <= 0) handleWalkout();
      } else if (overallScore >= 0.65) {
        // LOWBALL
        const newPatience = Math.max(0, patience - 28);
        setPatience(newPatience);
        setMood('frustrated');
        addMessage(
          'agent',
          `That offer is disappointing. The proposed salary and signing bonus fall short of what we need to agree a contract.`
        );
        if (newPatience <= 0) handleWalkout();
      } else {
        // INSULTING OFFER
        const newPatience = Math.max(0, patience - 45);
        setPatience(newPatience);
        setMood('furious');
        addMessage(
          'agent',
          `This offer is insulting to a player of ${player.gamertag}'s caliber! One more offer like this and we terminate talks immediately!`
        );
        addMessage('player', `Is this a joke?`);
        if (newPatience <= 0) handleWalkout();
      }
      setSubmitting(false);
    }, 600);
  };

  const handleMeetDemands = () => {
    if (!player || dealStatus !== 'ongoing' || submitting || !market.open || quote?.unavailableReason) return;
    setSubmitting(true);
    setOfferedWage(targetWage);
    setOfferedBonus(targetBonus);

    addMessage('manager', `We agree to all your baseline demands: $${targetWage.toLocaleString()}/mo and $${targetBonus.toLocaleString()} signing bonus.`);
    setTimeout(async () => {
      await finalizeSignedContract({ salary: targetWage, bonus: targetBonus });
      setSubmitting(false);
    }, 600);
  };

  const handleWalkout = () => {
    setDealStatus('collapsed');
    addMessage('agent', `Negotiations have completely broken down. We are leaving the room. We need to reconsider our approach before continuing.`);
  };

  const finalizeSignedContract = async (terms?: { salary: number; bonus: number }) => {
    if (!player || !team || !career) return;
    setSaveError(''); setSubmitting(true);
    try {
      const result = await window.api.management.sign(career.id, player.id, {
        salary: terms?.salary ?? offeredWage, bonus: terms?.bonus ?? offeredBonus,
        duration: offeredDuration, buyout: offeredBuyout,
        role:offeredRole,...clauses,
      });
      if (!result.success) throw new Error(result.error);
      setDealStatus('signed');
      setPatience(100);
      setMood('optimistic');
      addMessage('agent', 'The contract and transfer have been registered. We have a deal!');
      addMessage('player', `Let's get straight to work. I'm excited to put on the jersey!`);
      await reloadRoster();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
      addMessage('agent', `The transfer has not completed: ${message}`);
      const refreshed = await window.api.management.signingQuote(career.id, player.id).catch(() => null);
      if (refreshed?.success) setQuote(refreshed);
    }
    finally { setSubmitting(false); }
  };

  if (loading || !player) {
    return <div className="negotiation-loading">{saveError || 'Entering Executive Negotiation Suite...'}</div>;
  }
  let clauseError='',adjustedFee=quote?.fee||0;try{adjustedFee=clauseTerms({salary:offeredWage,...clauses},quote?.renewal?null:player.teamId,adjustedFee).fee;}catch(error){clauseError=error instanceof Error?error.message:String(error);}
  if((offeredRole==='Star Carry'&&clauses.playingTime<80)||(offeredRole==='Core Starter'&&clauses.playingTime<60))clauseError='The playing-time guarantee must support the proposed role.';
  const upfront = adjustedFee + offeredBonus + offeredWage;
  const funds = quote?.clubFunds ?? 0;
  let demandsCost=(quote?.fee||0)+targetBonus+targetWage;try{demandsCost=clauseTerms({salary:targetWage,...clauses},quote?.renewal?null:player.teamId,quote?.fee||0).fee+targetBonus+targetWage;}catch{/* Validation is shown next to the clause controls. */}
  const unavailable = !quote || !!quote.unavailableReason || !!clauseError;

  const patienceColor =
    patience >= 70 ? 'patience-high' :
    patience >= 35 ? 'patience-med' : 'patience-low';

  if(quote&&!quote.renewal&&(quote.needsApproach||!quote.approach?.willing||quote.approach?.role!==offeredRole))return <div className="management-page">
    <button className="btn btn-secondary" onClick={()=>navigate('/transfers')}>Back to recruitment</button>
    <section className="panel"><span className="eyebrow">Confidential agent approach</span><h1>Would {player.gamertag} consider your club?</h1><p>First establish the sporting project and playing role. Financial offers cannot override a refusal.</p>
    <label>Proposed role <select value={offeredRole} onChange={e=>{setOfferedRole(e.target.value as any);setClauses({...clauses,playingTime:e.target.value==='Star Carry'?80:e.target.value==='Core Starter'?60:0});}}>{['Star Carry','Core Starter','Substitute'].map(r=><option key={r}>{r}</option>)}</select></label>
    <p>Continental reputation: {Math.round(quote.interest?.continentalReputation||0)}/100 · Minimum transfer funds: ${(quote.fee||0).toLocaleString()} · Cash: ${(quote.clubFunds||0).toLocaleString()}</p>
    {quote.approach&&<div role="status"><h3>{quote.approach.willing?'Open to discussions':'Agent declined'}</h3>{quote.approach.reasons.map((r:string)=><p key={r}>{r}</p>)}<p>Response valid until {quote.approach.expiresDate}. Repeating the same approach does not reroll the decision.</p></div>}
    {saveError&&<p role="alert">{saveError}</p>}
    <button className="btn btn-primary" disabled={submitting} onClick={async()=>{if(!career)return;setSubmitting(true);try{const r=await window.api.management.approachAgent(career.id,player.id,offeredRole);if(r.success===false)throw Error(r.error);const fresh=await window.api.management.signingQuote(career.id,player.id);setQuote(fresh);setDialogue([{sender:'agent',time:'Now',text:r.willing?'The sporting project is acceptable. We can discuss personal terms.':r.reasons.join(' ')}]);}catch(e){setSaveError(String(e));}finally{setSubmitting(false);}}}>Ask agent about this project</button>
    </section></div>;
  if (!market.open) return <div className="management-page"><h1>Negotiations are closed</h1><p className="empty-state">{market.label}. You can scout and shortlist players while you wait.</p><button className="btn btn-primary" onClick={() => navigate('/transfers')}>Back to transfers</button></div>;

  return (
    <div className="negotiation-page">
      {saveError && <div className="notice notice-error" role="alert">{saveError}</div>}
      {/* Top Bar Navigation */}
      <div className="negotiation-topbar">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← EXIT NEGOTIATION
        </button>
        <span className="negotiation-title">LIVE CONTRACT NEGOTIATION SUITE</span>
        <span className="negotiation-team-tag">{team?.name} GM OFFICE</span>
      </div>

      <div className="negotiation-layout">
        {/* Left Column: Player & Agent Dossier */}
        <div className="negotiation-left-panel">
          <div className="negotiation-card player-hero-card">
            <PlayerAvatar playerId={player.id} gamertag={player.gamertag} overall={player.overall} size="xl" showBadge />
            <div className="player-hero-meta">
              <h2 className="player-hero-gamertag">{player.gamertag}</h2>
              <div className="player-hero-sub">
                {player.realName || 'Pro Player'} • Age {player.age} • {player.nationality}
              </div>
              <div className="player-hero-tags">
                <span className="tag-tendency">{player.preferredTendency}</span>
                <span className="tag-val">Market: ${(player.marketValue || 120000).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="negotiation-card agent-dossier-card">
            <div className="agent-header">
              <div className="agent-avatar">👔</div>
              <div>
                <h3 className="agent-name">{agentName}</h3>
                <span className="agent-role">Licensed Esports Agent</span>
              </div>
            </div>

            {/* Patience Meter */}
            <div className="patience-section">
              <div className="patience-header">
                <span>TALKS PATIENCE</span>
                <span className={`patience-val ${patienceColor}`}>{patience}%</span>
              </div>
              <div className="patience-bar-bg">
                <div
                  className={`patience-bar-fill ${patienceColor}`}
                  style={{ width: `${patience}%` }}
                />
              </div>
              <div className="agent-mood-badge">
                Mood: <strong className={`mood-${mood}`}>{mood.toUpperCase()}</strong>
              </div>
            </div>

            <div className="agent-demands-box">
              <h4 className="demands-heading">AGENT EXPECTATIONS</h4>
              <div className="demand-row">
                <span>Target Monthly Wage:</span>
                <strong>${targetWage.toLocaleString()}/mo</strong>
              </div>
              <div className="demand-row">
                <span>Expected Signing Bonus:</span>
                <strong>${targetBonus.toLocaleString()}</strong>
              </div>
              <div className="demand-row">
                <span>Preferred Contract:</span>
                <strong>2 - 3 Seasons</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Center / Right Column: Live Transcript & Offer Controls */}
        <div className="negotiation-right-panel">
          {/* Live Dialogue Transcript Box */}
          <div className="negotiation-card transcript-card">
            <h3 className="transcript-heading">BOARDROOM DIALOGUE TRANSCRIPT</h3>
            <div className="transcript-messages">
              {dialogue.map((msg, idx) => (
                <div key={idx} className={`dialogue-bubble sender-${msg.sender}`}>
                  <div className="bubble-header">
                    <span className="bubble-sender">
                      {msg.sender === 'agent' ? `👔 ${agentName}` : msg.sender === 'player' ? `🎮 ${player.gamertag}` : `💼 Manager`}
                    </span>
                    <span className="bubble-time">{msg.time}</span>
                  </div>
                  <div className="bubble-text">{msg.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Offer Controls Panel */}
          {dealStatus === 'ongoing' ? (
            <div className="negotiation-card terms-card">
              <h3 className="terms-heading">PROPOSED CONTRACT TERMS</h3>
              <div className="agent-demands-box signing-costs" aria-label="Signing costs">
                <div className="demand-row"><span>Transfer fee / existing buyout</span><strong>${adjustedFee.toLocaleString()}</strong></div>
                <div className="demand-row"><span>Signing bonus + first month's salary</span><strong>${(offeredBonus + offeredWage).toLocaleString()}</strong></div>
                <div className="demand-row"><span>Total needed upfront</span><strong>${upfront.toLocaleString()}</strong></div>
                <div className="demand-row"><span>Available club funds</span><strong>${funds.toLocaleString()}</strong></div>
                {upfront > funds && <p className="notice notice-error" role="status">Short by ${(upfront - funds).toLocaleString()}. Complete a sale or reduce the terms before signing.</p>}
                {quote?.unavailableReason && <p role="alert">{quote.unavailableReason}</p>}
                <small>The transfer fee is paid to the current club. It is separate from this player's new contract.</small>
              </div>

              <div className="panel" style={{marginBottom:16}}><h3>Transfer clauses and long-term commitments</h3>{clauseError&&<p className="notice notice-error" role="alert">{clauseError}</p>}<p>Sell-on rights and a buy-back option reduce the present fee. A selling-club wage contribution raises the agreed fee in exchange for lower future wage costs.</p>
              <div className="terms-grid">{([{key:'profitPercent',label:'Future transfer profit to selling club (%)',max:50},{key:'contributionPercent',label:'Selling-club wage contribution (%)',max:50},{key:'contributionMonths',label:'Contribution duration (months)',max:12},{key:'buybackFee',label:'Selling-club buy-back option ($, valid two years)',max:100000000},{key:'playingTime',label:'Guaranteed series involvement (%)',max:100}] as const).map(f=><label className="term-group" key={f.key}>{f.label}<input type="number" min="0" max={f.max} step="1" value={clauses[f.key]} disabled={(!player.teamId||quote?.renewal)&&f.key!=='playingTime'} onChange={e=>setClauses({...clauses,[f.key]:Number(e.target.value)})}/></label>)}</div>
              <p>Guaranteed cost over the next five years: <strong>${Math.max(0,adjustedFee+offeredBonus+offeredWage*Math.min(60,offeredDuration)-Math.round(offeredWage*clauses.contributionPercent/100)*Math.min(clauses.contributionMonths,offeredDuration)).toLocaleString()}</strong>. Includes this contract's wages, fee and bonus, less agreed contributions. A future resale may trigger the profit clause.</p><p>Playing-time promises are reviewed against actual series selections; repeated breaches lead to a transfer request.</p></div>
              <div className="terms-grid">
                {/* Monthly Salary */}
                <div className="term-group">
                  <div className="term-label-row">
                    <label>MONTHLY SALARY</label>
                    <span className="term-highlight">${offeredWage.toLocaleString()}/mo</span>
                  </div>
                  <input
                    type="range"
                    min={Math.round(targetWage * 0.4)}
                    max={Math.round(targetWage * 1.8)}
                    step={250}
                    value={offeredWage}
                    onChange={(e) => setOfferedWage(Number(e.target.value))}
                    className="slider-input"
                  />
                  <div className="slider-limits">
                    <span>${Math.round(targetWage * 0.4).toLocaleString()}</span>
                    <span>Target: ${targetWage.toLocaleString()}</span>
                    <span>${Math.round(targetWage * 1.8).toLocaleString()}</span>
                  </div>
                </div>

                {/* Signing Bonus */}
                <div className="term-group">
                  <div className="term-label-row">
                    <label>SIGNING BONUS</label>
                    <span className="term-highlight">${offeredBonus.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.round(targetBonus * 2)}
                    step={1000}
                    value={offeredBonus}
                    onChange={(e) => setOfferedBonus(Number(e.target.value))}
                    className="slider-input"
                  />
                  <div className="slider-limits">
                    <span>$0</span>
                    <span>Target: ${targetBonus.toLocaleString()}</span>
                    <span>${Math.round(targetBonus * 2).toLocaleString()}</span>
                  </div>
                </div>

                {/* Contract Duration */}
                <div className="term-group">
                  <label>CONTRACT DURATION</label>
                  <div className="pill-selector">
                    {[12, 24, 36, 48, 60].map((months) => (
                      <button
                        key={months}
                        className={`pill-btn ${offeredDuration === months ? 'active' : ''}`}
                        onClick={() => setOfferedDuration(months)}
                      >
                        {months / 12} {months === 12 ? 'Season' : 'Seasons'} ({months} mo)
                      </button>
                    ))}
                  </div>
                </div>

                {/* Squad Role */}
                <div className="term-group">
                  <label>PROPOSED SQUAD ROLE</label>
                  <div className="pill-selector">
                    {(['Star Carry', 'Core Starter', 'Substitute'] as const).map((role) => (
                      <button
                        key={role}
                        className={`pill-btn ${offeredRole === role ? 'active' : ''}`}
                        onClick={() => {setOfferedRole(role);setClauses({...clauses,playingTime:role==='Star Carry'?80:role==='Core Starter'?60:0});}}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions Toolbar */}
              {saveError && <div className="notice notice-error" role="alert">{saveError}</div>}
              <div className="terms-actions-bar">
                <button
                  className="btn btn-secondary text-danger"
                  onClick={handleWalkout}
                  disabled={submitting}
                >
                  🚶 Walk Away From Talks
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleMeetDemands}
                  disabled={submitting || unavailable || demandsCost > funds}
                >
                  🤝 Accept Agent Demands (${targetWage.toLocaleString()}/mo)
                </button>
                <button
                  className="btn btn-primary submit-offer-btn"
                  onClick={handleCounterOffer}
                  disabled={submitting || unavailable || upfront > funds}
                >
                  {submitting ? 'Presenting Offer...' : '📝 Submit Counter-Offer'}
                </button>
              </div>
            </div>
          ) : dealStatus === 'signed' ? (
            <div className="negotiation-card deal-signed-card">
              <div className="signed-stamp">OFFICIAL CONTRACT SIGNED</div>
              <h2>WELCOME TO {team?.name.toUpperCase()}, {player.gamertag}!</h2>
              <p>
                Contract ratified for {offeredDuration} months at ${offeredWage.toLocaleString()}/month.
                The player has been registered to your organization squad roster.
              </p>
              <div className="signed-actions">
                <button className="btn btn-primary" onClick={() => navigate('/squad')}>
                  View Active Squad
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/transfers')}>
                  Return to Transfers
                </button>
              </div>
            </div>
          ) : (
            <div className="negotiation-card deal-collapsed-card">
              <div className="collapsed-stamp">TALKS TERMINATED</div>
              <h2>NEGOTIATIONS HAVE BROKEN DOWN</h2>
              <p>
                The agent and {player.gamertag} have left the negotiation suite without an agreement.
                Reconsider the sporting project and contract terms before approaching again.
              </p>
              <button className="btn btn-secondary" onClick={() => navigate(-1)}>
                Leave Boardroom
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
