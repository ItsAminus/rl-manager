import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { PlayerAvatar } from '../components/PlayerAvatar';
import './SocialPage.css';
import {playUiSound} from '../audio/ui-sounds';
import {publicAssetUrl as assetUrl} from '../utils/public-assets';

const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const paths: Record<string, string> = {
  home: 'M3 10l9-7 9 7v10h-6v-7H9v7H3z', explore: 'M4 9h16 M3 15h16 M10 3L6 21 M18 3l-4 18',
  notifications: 'M5 17h14l-2-3V9a5 5 0 00-10 0v5z M10 21h4', bookmarks: 'M6 3h12v18l-6-4-6 4z', profile: 'M4 21v-3a5 5 0 015-5h6a5 5 0 015 5v3 M16 6a4 4 0 11-8 0 4 4 0 018 0',
  reply: 'M4 4h16v13h-9l-7 4z', repost: 'M3 8l4-4 4 4 M7 4v13h10 M21 16l-4 4-4-4 M17 20V7H7',
  like: 'M12 21S2 14 2 8a5 5 0 0110-2 5 5 0 0110 2c0 6-10 13-10 13z', search: 'M16 10a6 6 0 11-12 0 6 6 0 0112 0 M15 15l6 6',
  back: 'M20 12H4 M10 6l-6 6 6 6', arrow: 'M4 12h16 M14 6l6 6-6 6', stats: 'M5 20v-6 M12 20V4 M19 20V9', check: 'M4 12l5 5L20 6',
};
const Icon = ({ name, size = 21 }: { name: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.reply}/></svg>;
const Bird = () => <img className="chirp-emblem" src={assetUrl('/brand/chirp-emblem.png')} width="44" height="44" alt="Chirp falcon emblem"/>;
const OfficialAvatar = ({a,large=false}:{a:any;large?:boolean}) => {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[a.id,a.avatarUrl]);
  if(!a.avatarUrl || failed)return a.playerId?<PlayerAvatar playerId={a.playerId} gamertag={a.displayName} overall={a.overall||80} size={large?'lg':'sm'}/>:<span className={`chirp-avatar ${large?'large':''}`} style={{background:a.color+'22',color:a.color}}>{a.displayName.slice(0,2)}</span>;
  const url=assetUrl(a.avatarUrl);
  return <img className={`chirp-avatar official ${large?'large':''}`} src={url} alt={a.displayName} loading="lazy" title={'Profile image · '+(a.avatarSource||a.profileUrl)} onError={()=>setFailed(true)}/>;
};
const Avatar = ({ a, large = false }: { a: any; large?: boolean }) => a?.avatarUrl?<OfficialAvatar a={a} large={large}/>:a?.playerId
  ? <PlayerAvatar playerId={a.playerId} gamertag={a.displayName} overall={a.overall || 80} size={large ? 'lg' : 'sm'} className="chirp-player-avatar"/>
  : <span className={`chirp-avatar ${large ? 'large' : ''} ${a?.id === 'esports' ? 'esports' : ''}`} style={{ background: a?.color + '22', color: a?.color }}>{a?.id === 'esports' ? 'RL' : a?.displayName?.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}</span>;
const Verified = ({ a }: { a: any }) => a?.verified ? <span className="chirp-verified" title="Recognized career account"><Icon name="check" size={11}/></span> : null;
const unwrap = (res: any) => { if (res?.success === false) throw new Error(res.error); return res; };

export const SocialPage: React.FC = () => {
  const { career, currentDate, team, roster, reloadRoster } = useCareerStore();
  const navigate = useNavigate(), [params, setParams] = useSearchParams();
  const view = params.get('view') || 'home', account = params.get('account') || '', threadId = params.get('post') || '';
  const query = params.get('q') || '', region = params.get('region') || '', mode = params.get('mode') || 'all';
  const [data, setData] = useState<any>(null), [posts, setPosts] = useState<any[]>([]), [profile, setProfile] = useState<any>(null), [thread, setThread] = useState<any>(null), [notifications, setNotifications] = useState<any[]>([]);
  const [draft, setDraft] = useState(''), [reply, setReply] = useState(''), [search, setSearch] = useState(query);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(''), [loading, setLoading] = useState(true), [newPosts, setNewPosts] = useState(false);
  const sequence = useRef(0), composer = useRef<HTMLTextAreaElement>(null), latest = useRef('');
  const revision=useRef(-1);
  const acting=useRef(false),freshRequested=useRef(false);
  const routeRef=useRef('');routeRef.current=[view,account,threadId,query,region,mode].join('|');
  const [repairRevision,setRepairRevision]=useState(0);
  const postPins=useRef(new Map<string,any>()),followPins=useRef(new Map<string,boolean>());
  const pinAccount=(a:any)=>a&&followPins.current.has(a.id)?{...a,following:followPins.current.get(a.id)}:a;
  const pinPost=(p:any)=>({...p,...postPins.current.get(p.id),account:pinAccount(p.account)});
  const patchPost=(id:string,change:(p:any)=>any)=>{
    setPosts(items=>items.map(p=>p.id===id?change(p):p));
    setThread((t:any)=>t?{...t,post:t.post.id===id?change(t.post):t.post,ancestors:t.ancestors?.map((p:any)=>p.id===id?change(p):p),replies:t.replies.map((p:any)=>p.id===id?change(p):p)}:t);
  };
  const patchFollow=(id:string,following:boolean)=>{
    const patch=(a:any)=>a?.id===id?{...a,following}:a;
    setProfile((p:any)=>p?.id===id?{...p,following,followers:p.followers+Number(following)-Number(!!p.following)}:p);
    setPosts(items=>items.map(p=>({...p,account:patch(p.account)})));
    setData((d:any)=>d?{...d,suggestions:d.suggestions.map(patch),people:d.people.map(patch)}:d);
  };
  const options = { mode: view === 'bookmarks' ? 'bookmarks' : view === 'home' && mode === 'following' ? 'following' : 'all', account: view === 'profile' ? account : '', query: view === 'explore' ? query : '', region: view === 'explore' ? region : '' };
  const go = (v: string, extra: Record<string, string> = {}) => { setNotice(''); setParams({ view: v, ...extra }); document.querySelector('.main-content')?.scrollTo({ top: 0 }); };
  const openProfile = (id: string) => go('profile', { account: id });
  const openThread = (id: string) => go('thread', { post: id });
  const load = async (append = false, refreshText = false, fresh = false) => {
    if (!career) return;
    const request = ++sequence.current;
    if(fresh)freshRequested.current=true;
    const result = unwrap(await window.api.management.chirpFeed(career.id, { ...options, refresh:fresh,cursor: append ? data?.cursor : undefined }));
    if (request !== sequence.current) return;
    result.posts=result.posts.map(pinPost);result.suggestions=result.suggestions.map(pinAccount);result.people=result.people.map(pinAccount);
    setData((prev:any)=>refreshText?{...result,cursor:prev?.cursor}:result);
    setPosts(prev => refreshText ? prev.map(p=>result.posts.find((updated:any)=>updated.id===p.id)||p) : append ? [...prev, ...result.posts.filter((p: any) => !prev.some(x => x.id === p.id))] : result.posts);
    if(!refreshText){latest.current = result.posts[0]?.id || ''; setNewPosts(false);}
    if (view === 'profile') { const p = unwrap(await window.api.management.chirpProfile(career.id, account)); if (request === sequence.current) setProfile(pinAccount(p)); }
    if (view === 'thread') { const t = unwrap(await window.api.management.chirpThread(career.id, threadId)); if (request === sequence.current) setThread({...t,post:pinPost(t.post),ancestors:t.ancestors?.map(pinPost),replies:t.replies.map(pinPost)}); }
    if (view === 'notifications') { const n = unwrap(await window.api.management.chirpNotifications(career.id, true)); if (request === sequence.current) { setNotifications(n); setData((d: any) => ({ ...d, unread: 0 })); } }
  };
  useEffect(() => {
    setLoading(true); setSearch(query); setProfile(null); setThread(null); setReply('');
    load(false,false,view==='home').catch(e => setNotice(e.message)).finally(() => setLoading(false));
    return () => { sequence.current++; };
  }, [career?.id, currentDate, view, account, threadId, query, region, mode]);
  useEffect(()=>{
    if(!repairRevision)return;
    load().catch(e=>setNotice(e.message)).finally(()=>setLoading(false));
  },[repairRevision]);
  useEffect(() => {
    if (!career) return;
    let live = true,checking=false;
    const timer = window.setInterval(async () => {
      if(checking||acting.current)return;checking=true;
      try {
        const res = unwrap(await window.api.management.chirpUpdates(career.id));
        if (live && res.latest !== latest.current && ['home','explore'].includes(view)) {
          if(freshRequested.current){freshRequested.current=false;await load();}
          else setNewPosts(true);
        }
        if (live) setData((d: any) => d ? { ...d, unread: res.unread } : d);
        if(live && !latest.current && res.latest)await load();
        else if(live && revision.current!==res.revision){revision.current=res.revision;await load(false,true);}
      } catch { /* Keep the existing feed visible until the next explicit refresh. */ }
      finally{checking=false;}
    }, 3000);
    return () => { live = false; clearInterval(timer); };
  }, [career?.id, view, query, region, mode,account,threadId]);
  const action = async (key: string, fn: () => Promise<void>) => {
    if (acting.current) return;
    acting.current=true;
    setBusy(key); setNotice('');
    try { await fn(); } catch (e: any) { setNotice(e.message || String(e));playUiSound('error'); } finally { acting.current=false;setBusy(''); }
  };
  const follow = (id: string) => action('follow:' + id, async () => {
    const requestRoute=routeRef.current;
    const previous=!!(profile?.id===id?profile.following:[...(data?.people||[]),...(data?.suggestions||[])].find(a=>a.id===id)?.following);
    sequence.current++;followPins.current.set(id,!previous);patchFollow(id,!previous);
    try{const result=unwrap(await window.api.management.chirpFollow(career!.id,id));sequence.current++;patchFollow(id,!!result.following);if(result.following)playUiSound('follow');}
    catch(error){patchFollow(id,previous);throw error;}
    finally{followPins.current.delete(id);if(requestRoute!==routeRef.current)setRepairRevision(n=>n+1);}
  });
  const react = (post: any, type: string) => action(type + ':' + post.id, async () => {
    const requestRoute=routeRef.current;
    const field=type==='like'?'liked':type==='repost'?'reposted':'bookmarked',next=!post[field];
    const optimistic={...post,[field]:next,...(type==='like'?{likes:post.likes+(next?1:-1)}:type==='repost'?{reposts:post.reposts+(next?1:-1)}:{})};
    sequence.current++;postPins.current.set(post.id,optimistic);patchPost(post.id,()=>optimistic);
    try{const res=unwrap(await window.api.management.chirpReact(career!.id,post.id,type));sequence.current++;patchPost(post.id,()=>res.post);if(next)playUiSound(type==='like'?'like':type==='repost'?'repost':'tap');}
    catch(error){patchPost(post.id,()=>post);throw error;}
    finally{postPins.current.delete(post.id);if(requestRoute!==routeRef.current)setRepairRevision(n=>n+1);}
    if (view === 'bookmarks' && type === 'bookmark') setPosts(items => items.filter(p => p.id !== post.id));
  });
  const publish = (isReply = false) => action('publish', async () => {
    const res = unwrap(await window.api.management.chirpPublish(career!.id, isReply ? reply : draft, isReply ? thread.post.id : undefined));
    playUiSound('post');
    if (isReply) { setReply(''); await load(); }
    else { setDraft(''); openThread(res.threadId); }
  });
  const support = (p: any) => action('support:' + p.id, async () => {
    unwrap(await window.api.management.supportPlayer(career!.id, p.support.id));
    await reloadRoster(); await load(); setNotice(`You reassured ${p.support.name} privately. Morale and confidence improved.`);
  });
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); go('explore', { q: search.trim(), ...(region ? { region } : {}) }); };
  const body = (text: string) => text.split(/(#[A-Za-z0-9_]+)/g).map((part, i) => part.startsWith('#') ? <button className="chirp-hashtag" key={i} onClick={() => go('explore', { q: part.slice(1) })}>{part}</button> : part);
  const renderPost = (p: any, detail = false) => {
    const reposter = p.reactions.find((r: any) => r.type === 'repost' && r.id !== p.accountId);
    return <article className={`chirp-post ${detail ? 'detail' : ''}`} key={p.id} data-post-id={p.id} data-account-id={p.accountId}>
      {!p.parentId && reposter && <div className="chirp-reposted"><Icon name="repost" size={14}/><button onClick={() => openProfile(reposter.id)}>{reposter.id === 'manager' ? 'You' : reposter.displayName} reposted</button></div>}
      <div className="chirp-post-main"><button className="chirp-avatar-button" aria-label={`Open ${p.account.displayName}'s profile`} onClick={() => openProfile(p.account.id)}><Avatar a={p.account}/></button><div className="chirp-post-content">
        <div className="chirp-byline"><button onClick={() => openProfile(p.account.id)} className="chirp-author">{p.account.displayName}</button><Verified a={p.account}/><span>@{p.account.handle}</span><span>· {p.date.slice(5)}</span></div>
        <span className="chirp-account-kind">{p.account.kind} {p.account.region !== 'Global' ? '· ' + p.account.region : ''}</span>
        {p.replyTo&&<button className="chirp-replying-to" onClick={()=>openThread(p.replyTo.id)}>Replying to @{p.replyTo.account.handle}</button>}
        <div className={`chirp-body ${!detail?'openable':''}`} role={!detail?'link':undefined} tabIndex={!detail?0:undefined} onClick={!detail?e=>{if(!(e.target as Element).closest('button,a'))openThread(p.id);}:undefined} onKeyDown={!detail?e=>{if(e.target===e.currentTarget && (e.key==='Enter'||e.key===' ')){e.preventDefault();openThread(p.id);}}:undefined}>{body(p.body)}</div>
        {p.media&&<figure className={`chirp-media ${p.media.kind==='meme'?'meme':''}`}>
          {p.media.kind==='receipt'?<div className="chirp-receipt" aria-label="Series result receipt">
            <span>{p.media.competition} · {p.media.format}</span><strong>{p.media.headline}</strong>
            <blockquote>“{p.media.quote}”</blockquote><div className="chirp-receipt-score"><span>{p.media.home}</span><b>{p.media.score}</b><span>{p.media.away}</span></div>
            <div className="chirp-receipt-games">{p.media.games.map((g:any)=><div key={g.game}><small>GAME {g.game}</small><b>{g.score}</b><span>{g.blue} · {g.orange}</span></div>)}</div>
          </div>:<img src={assetUrl(p.media.url)} alt={p.media.caption} loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>}
          {p.media.top&&<strong className="chirp-meme-top">{p.media.top}</strong>}{p.media.bottom&&<strong className="chirp-meme-bottom">{p.media.bottom}</strong>}
          <figcaption><span>{p.media.caption}</span>{p.media.source&&<a href={p.media.source} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Image source ↗</a>}</figcaption>
        </figure>}
        {p.quote&&<button className="chirp-quote" onClick={()=>openThread(p.quote.id)}><span className="chirp-quote-author"><Avatar a={p.quote.account}/><strong>{p.quote.account.displayName}</strong><Verified a={p.quote.account}/><span>@{p.quote.account.handle}</span></span><span>{p.quote.body}</span></button>}
        {detail && <div className="chirp-detail-stamp">{p.date} · <strong>{compact(p.views)}</strong> views · Career broadcast</div>}
        <div className="chirp-actions">
          <button title="View replies" aria-label={`Reply to ${p.account.displayName}`} onClick={() => openThread(p.id)}><Icon name="reply" size={18}/><span>{compact(p.replies)}</span></button>
          <button className={p.reposted ? 'active-repost' : ''} aria-pressed={p.reposted} aria-label={`Repost ${p.account.displayName}'s chirp`} disabled={!!busy} onClick={() => react(p, 'repost')}><Icon name="repost" size={18}/><span>{compact(p.reposts)}</span></button>
          <button className={p.liked ? 'active-like' : ''} aria-pressed={p.liked} aria-label={`Like ${p.account.displayName}'s chirp`} disabled={!!busy} onClick={() => react(p, 'like')}><Icon name="like" size={18}/><span>{compact(p.likes)}</span></button>
          <span className="chirp-views" title="Simulated views"><Icon name="stats" size={16}/>{compact(p.views)}</span>
          <button className={p.bookmarked ? 'active-bookmark' : ''} aria-pressed={p.bookmarked} aria-label={`Bookmark ${p.account.displayName}'s chirp`} disabled={!!busy} onClick={() => react(p, 'bookmark')}><Icon name="bookmarks" size={18}/></button>
        </div>
        {!detail && p.replies > 0 && <button className="chirp-conversation-link" onClick={() => openThread(p.id)}>Show this conversation</button>}
        {p.support && <div className="chirp-player-impact"><span>{p.support.name} · Morale {p.support.morale > 0 ? '+' : ''}{p.support.morale} · Confidence {p.support.confidence > 0 ? '+' : ''}{p.support.confidence}</span><button disabled={!!busy || p.support.responded} onClick={() => support(p)}>{p.support.responded ? 'Supported privately' : 'Reassure privately'}</button></div>}
      </div></div>
    </article>;
  };
  const person = (a: any) => <div className="chirp-person" key={a.id}><button className="chirp-avatar-button" onClick={() => openProfile(a.id)} aria-label={`Open ${a.displayName}'s profile`}><Avatar a={a}/></button><button className="chirp-person-name" onClick={() => openProfile(a.id)}><strong>{a.displayName} <Verified a={a}/></strong><span>@{a.handle}</span><small>{a.kind} · {a.region}</small></button>{a.id !== 'manager' && <button className={`chirp-follow ${a.following ? 'following' : ''}`} disabled={!!busy} onClick={() => follow(a.id)}>{a.following ? 'Following' : 'Follow'}</button>}</div>;
  if (!career) return <div className="chirp-empty">Load a career to enter Chirp.</div>;
  const title = view === 'profile' ? 'Profile' : view === 'thread' ? 'Conversation' : view === 'bookmarks' ? 'Bookmarks' : view === 'notifications' ? 'Notifications' : view === 'explore' ? 'Explore' : 'Home';
  return <div className="chirp-environment"><div className="chirp-shell">
    <aside className="chirp-nav"><button className="chirp-logo" onClick={() => go('home')} aria-label="Chirp home"><Bird/><span>chirp<span className="chirp-logo-dot">.</span></span></button>
      <nav aria-label="Chirp navigation">{[['home', 'Home'], ['explore', 'Explore'], ['notifications', 'Notifications'], ['bookmarks', 'Bookmarks'], ['profile', 'Profile']].map(([id, label]) => <button key={id} className={(view === id || id === 'home' && view === 'thread') ? 'selected' : ''} onClick={() => go(id, id === 'profile' ? { account: 'manager' } : {})}><Icon name={id}/><span>{label}</span>{id === 'notifications' && data?.unread > 0 && <b className="chirp-unread">{data.unread}</b>}</button>)}</nav>
      <button className="chirp-primary chirp-write" onClick={() => { go('home'); window.setTimeout(() => composer.current?.focus(), 100); }}>Chirp <span>+</span></button>
      <div className="chirp-nav-bottom"><p>YOUR CAREER WORLD<br/><span>Fictional posts and reactions.<br/>Your results shape the conversation.</span></p><button className="chirp-club-return" onClick={() => navigate('/dashboard')}><Icon name="back" size={16}/><span>Back to club</span></button>{data?.manager && <button className="chirp-manager-card" onClick={() => openProfile('manager')}><Avatar a={data.manager}/><span><strong>{career.managerName}</strong><small>@{data.manager.handle}</small></span></button>}</div>
    </aside>
    <section className="chirp-timeline" aria-label={title}>
      <header className="chirp-header">{view !== 'home' && <button className="chirp-back" aria-label="Back in Chirp" onClick={() => Number(window.history.state?.idx) > 0 ? navigate(-1) : go('home')}><Icon name="back"/></button>}<div><h1>{title}</h1><span>{view === 'home' ? 'The whole scene. One conversation.' : view === 'bookmarks' ? 'Your saved chirps, all in one place.' : view === 'explore' ? 'Find your corner of Rocket League.' : view === 'notifications' ? 'The conversation comes back to you.' : 'In your career universe'}</span></div><button className="chirp-refresh" aria-label="Refresh Chirp" onClick={() => action('refresh', async () => { await load(false,false,true); })} disabled={!!busy}>↻</button></header>
      {notice && <div className="chirp-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
      {view === 'home' && <><div className="chirp-tabs"><button className={mode !== 'following' ? 'active' : ''} onClick={() => go('home')}>For you</button><button className={mode === 'following' ? 'active' : ''} onClick={() => go('home', { mode: 'following' })}>Following</button></div><div className="chirp-composer">{data?.manager && <Avatar a={data.manager}/>}<div><textarea ref={composer} value={draft} maxLength={500} onChange={e => setDraft(e.target.value)} placeholder="What's happening around your team?" aria-label="Write a chirp" rows={3}/><div className="chirp-compose-footer"><span>🌐 Everyone in your career can reply</span><small>{draft.length}/500</small><button className="chirp-primary" disabled={!draft.trim() || !!busy} onClick={() => publish()}>{busy === 'publish' ? 'Posting…' : 'Chirp'}</button></div></div></div></>}
      {view === 'explore' && <div className="chirp-explore"><form onSubmit={submitSearch} className="chirp-search"><Icon name="search" size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players, clubs, topics" aria-label="Search Chirp"/><button type="submit">Search</button></form><div className="chirp-region-filter"><label htmlFor="chirp-region">Around the world</label><select id="chirp-region" value={region} onChange={e => go('explore', { ...(query ? { q: query } : {}), ...(e.target.value ? { region: e.target.value } : {}) })}><option value="">All regions</option>{data?.regions.map((r: string) => <option key={r}>{r}</option>)}</select></div>{data?.people.length > 0 && <div className="chirp-people-results"><h2>People & clubs</h2>{data.people.map((a: any) => person(a))}<h2>Chirps</h2></div>}{!query && !region && <div className="chirp-explore-topics"><span>THE CONVERSATION RIGHT NOW</span>{data?.trends.map((t: any) => <button key={t.topic} onClick={() => go('explore', { q: t.topic })}><strong>#{t.topic}</strong><small>{compact(t.count)} chirps</small><Icon name="arrow" size={16}/></button>)}</div>}</div>}
      {loading ? <div className="chirp-empty">Opening the conversation…</div> : view === 'profile' && profile ? <div className="chirp-profile"><div className="chirp-profile-banner" style={{ background: `linear-gradient(${105+(profile.coverSeed||0)%60}deg,${profile.color}70,#111c30 75%)` }}>
        {profile.bannerUrl?<img className="chirp-cover-image" src={assetUrl(profile.bannerUrl)} alt={`${profile.displayName} public channel banner`} onError={e=>{e.currentTarget.style.display='none';}}/>:<>
          {profile.coverPortrait&&<img className="chirp-cover-portrait" src={assetUrl(profile.coverPortrait)} alt=""/>}
          {profile.coverLogo&&<img className="chirp-cover-logo" src={assetUrl(profile.coverLogo)} alt=""/>}
        </>}
        <span>{profile.kind === 'Player' ? profile.club : profile.kind === 'Manager' ? team?.name : profile.region}</span><Bird/>
        <span className="chirp-cover-label" title={profile.bannerSource||profile.coverSource||'Original Chirp profile cover'}>{profile.bannerUrl?'Public channel banner':'Chirp cover'}</span>
      </div><div className="chirp-profile-info"><div className="chirp-profile-top"><Avatar a={profile} large/>{profile.id !== 'manager' && <button className={`chirp-follow ${profile.following ? 'following' : ''}`} onClick={() => follow(profile.id)} disabled={!!busy}>{profile.following ? 'Following' : 'Follow'}</button>}</div><h2>{profile.displayName} <Verified a={profile}/></h2><span className="chirp-muted">@{profile.handle}</span><p>{profile.bio}</p><div className="chirp-profile-meta"><span>{profile.kind}</span><span>{profile.region}</span><span>{profile.postCount} chirps</span></div><div className="chirp-profile-counts">{profile.followingCount !== null && <span><strong>{compact(profile.followingCount)}</strong> Following</span>}<span><strong>{compact(profile.followers)}</strong> Followers</span>{profile.playerId && <button onClick={() => navigate('/player/' + profile.playerId)}>Player dossier →</button>}</div></div><div className="chirp-profile-tab">Chirps & reposts</div></div> : null}
      {!loading && view === 'thread' && thread && <>{thread.ancestors?.length>0&&<div className="chirp-ancestors" aria-label="Earlier in this conversation">{thread.ancestors.length>2&&<button className="chirp-earlier-context" onClick={()=>openThread(thread.ancestors[thread.ancestors.length-3].id)}>View earlier messages ↑</button>}{thread.ancestors.slice(-2).map((p:any)=><div key={p.id}>{renderPost(p)}</div>)}</div>}<div className="chirp-thread-root">{renderPost(thread.post, true)}{thread.post.reactions.length > 0 && <div className="chirp-engaged"><span>In the conversation</span>{thread.post.reactions.filter((r: any, i: number, a: any[]) => a.findIndex(x => x.id === r.id) === i).slice(0, 8).map((r: any) => <button key={r.id} onClick={() => openProfile(r.id)}>{r.id === 'manager' ? 'You' : r.displayName}<small>{thread.post.reactions.filter((x: any) => x.id === r.id).map((x: any) => x.type === 'like' ? 'liked' : 'reposted').join(' · ')}</small></button>)}</div>}</div><div className="chirp-reply-composer"><textarea aria-label="Write a reply" placeholder={`Reply to @${thread.post.account.handle}`} value={reply} maxLength={500} onChange={e => setReply(e.target.value)} rows={2}/><div><span className="chirp-compose-target">To @{thread.post.account.handle}</span><span>{reply.length}/500</span><button className="chirp-primary" disabled={!reply.trim() || !!busy} onClick={() => publish(true)}>Reply</button></div></div>{thread.replies.map((p: any) => renderPost(p))}{thread.preparing>0&&<div className="chirp-preparing" role="status">New replies are being written. They will appear here when ready.</div>}{thread.replies.length === 0 && !thread.preparing && <div className="chirp-empty">Start the conversation. Be the first to reply.</div>}</>}
      {!loading && view === 'notifications' && <>{notifications.length === 0 ? <div className="chirp-empty"><Icon name="notifications" size={35}/><h2>Your conversation starts here.</h2><p>Post a chirp or join a discussion. Replies, likes and reposts will appear here.</p></div> : notifications.map(n => <button className={`chirp-notification ${n.isRead ? '' : 'unread'}`} key={n.id} onClick={() => openThread(n.postId)}><span className={`chirp-notification-icon ${n.type}`}><Icon name={n.type}/></span><Avatar a={n.account}/><span><strong>{n.account.displayName}</strong> {n.body}<small>{n.date} · View conversation →</small></span></button>)}</>}
      {!loading && !['thread', 'notifications'].includes(view) && <>{newPosts && <button className="chirp-new-posts" onClick={() => action('refresh', async () => { await load(); })}>New chirps · Show latest</button>}{posts.map(p => renderPost(p))}{posts.length === 0 && <div className="chirp-empty"><h2>{view === 'bookmarks' ? 'Keep a good take for later.' : 'A little quiet here.'}</h2><p>{view === 'bookmarks' ? 'Tap the bookmark on a chirp to save it here.' : 'Try another search or follow more people around the scene.'}</p></div>}{data?.cursor && <button className="chirp-load-more" disabled={!!busy} onClick={() => action('more', async () => { await load(true); })}>{busy === 'more' ? 'Loading…' : 'Show more chirps'}</button>}</>}
    </section>
    <aside className="chirp-discover"><form className="chirp-search" onSubmit={submitSearch}><Icon name="search" size={18}/><input aria-label="Quick search Chirp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Chirp"/></form><div className="chirp-world-card"><span className="chirp-live-dot"/> <span>THE ROCKET LEAGUE WORLD</span><h2>Every series<br/>has a story.</h2><p>Players. Analysts. The people in the stands. See what the scene is saying.</p><button onClick={() => go('explore')}>Explore the conversation <Icon name="arrow" size={16}/></button></div><section className="chirp-side-panel"><h2>What's chirping</h2>{data?.trends.map((t: any, i: number) => <button className="chirp-trend" key={t.topic} onClick={() => go('explore', { q: t.topic })}><small>{i + 1} · Trending in your career</small><strong>#{t.topic}</strong><span>{compact(t.count)} chirps</span></button>)}</section><section className="chirp-side-panel chirp-follow-panel"><h2>Who to follow</h2>{data?.suggestions.map((a: any) => person(a))}<button className="chirp-show-more" onClick={() => go('explore')}>Find more people</button></section><section className="chirp-side-panel chirp-mindset"><h2>Inside your club</h2><p>Public pressure reaches the dressing room. Reassure players privately on posts about your squad.</p>{roster.slice(0, 3).map(p => <button key={p.id} onClick={() => navigate('/player/' + p.id)}><span>{p.gamertag}</span><small>Morale {p.morale}</small></button>)}</section><footer>Chirp · {currentDate}<br/>Simulated accounts in your career.<br/>These are not real social media posts.</footer></aside>
  </div></div>;
};
