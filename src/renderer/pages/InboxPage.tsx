import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { InboxItem } from '../../types';
import './InboxPage.css';
import {playUiSound} from '../audio/ui-sounds';

export const InboxPage: React.FC = () => {
  const { career, currentDate } = useCareerStore();
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState('');
  const [markingAll,setMarkingAll]=useState(false);
  const markAll=async()=>{
    if(!career||markingAll)return;
    setMarkingAll(true);setError('');
    try{
      const result=await window.api.inbox.markAllRead(career.id);
      if(!result.success)throw new Error(result.error||'Messages could not be marked as read.');
      setItems(previous=>previous.map(item=>({...item,isRead:true})));
      useCareerStore.setState({unreadInboxCount:result.unread});playUiSound('success');
    }catch(err:any){setError(err.message);playUiSound('error');}
    finally{setMarkingAll(false);}
  };
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id || '');

  useEffect(() => {
    async function loadInbox() {
      if (!career) return;
      try {
        if (window.api?.inbox) {
          const loaded = await window.api.inbox.getAll(career.id);
          if (loaded) {
            setItems(loaded);
            setSelectedId(previous => loaded.some((m: InboxItem) => m.id === previous) ? previous : loaded[0]?.id || '');
          }
        }
      } catch (err) {
        console.error('Failed to load inbox', err);
      }
    }
    loadInbox();
  }, [career?.id, currentDate]);

  const handleSelect = async (item: InboxItem) => {
    playUiSound('tap');
    setSelectedId(item.id);
    if (!item.isRead) {
      if (window.api?.inbox) {
        const result = await window.api.inbox.markRead(item.id);
        if (!result.success) { setError('The message could not be marked as read.'); return; }
        const count = await window.api.inbox.getUnreadCount(career!.id);
        useCareerStore.setState({ unreadInboxCount: count });
      }
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, isRead: true } : m))
      );
    }
  };

  const selectedItem = items.find((m) => m.id === selectedId) || items[0];

  return (
    <div className="inbox-page">
      <div className="inbox-header">
        <div>
          <h1 className="page-heading">MANAGER INBOX & DISPATCHES</h1>
          <p className="page-subheading">
            Player conversations, club reports, tournament updates and scout findings.
          </p>
        </div>
        <button className="btn btn-secondary" data-sound="none" title="Mark every email in this career as read. Decisions remain pending." onClick={markAll} disabled={markingAll||!items.some(item=>!item.isRead)}>{markingAll?'Marking…':'✓ Read all'}</button>
      </div>

      {error && <div role="alert" className="notice notice-error">{error}</div>}
      <div className="inbox-layout">
        {/* Left List */}
        <div className="inbox-list-panel">
          {!items.length && <p className="empty-state">Your inbox is clear. Scout reports, club news and competition updates will arrive here.</p>}
          {items.map((item) => (
            <div
              key={item.id}
              className={`inbox-item-card ${selectedId === item.id ? 'selected' : ''} ${
                !item.isRead ? 'unread' : ''
              }`}
              onClick={() => handleSelect(item)}
            >
              <div className="inbox-card-top">
                <span className="inbox-card-type">{item.type?.replace('_', ' ').toUpperCase()}</span>
                <span className="inbox-card-date">{item.date}</span>
              </div>
              <div className="inbox-card-title">{item.title}</div>
              <div className="inbox-card-preview">{item.body.slice(0, 70)}...</div>
            </div>
          ))}
        </div>

        {/* Right Reader */}
        <div className="inbox-reader-panel">
          {selectedItem ? (
            <div className="reader-content">
              <div className="reader-header">
                <span className="reader-type-tag">
                  {selectedItem.type?.replace('_', ' ').toUpperCase()}
                </span>
                <span className="reader-date">{selectedItem.date}</span>
              </div>

              <h2 className="reader-title">{selectedItem.title}</h2>

              <div className="reader-body">
                <p>{selectedItem.body}</p>
                {selectedItem.actions?.filter(a => a.action === 'navigate' && typeof a.data?.href === 'string' && a.data.href.startsWith('/')).map((a, i) => <button key={i} className="btn btn-primary" onClick={() => navigate(String(a.data!.href))}>{a.label}</button>)}
              </div>

              <div className="reader-signature">
                <span>Official Notice</span>
                <strong>{selectedItem.type === 'player_conversation' ? 'Your squad' : 'Club office'}</strong>
              </div>
            </div>
          ) : (
            <div className="reader-empty">No message selected.</div>
          )}
        </div>
      </div>
    </div>
  );
};
