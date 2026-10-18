import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerStore } from '../../stores/careerStore';
import { CalendarEvent, Fixture } from '../../types';
import { addDays } from '../../game/career-rules';
import './CalendarPage.css';

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { career, team, currentDate, advanceDay, advanceToNextEvent, error } = useCareerStore();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [advancing, setAdvancing] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>(currentDate);
  useEffect(() => setSelectedDate(currentDate), [currentDate]);

  useEffect(() => {
    async function loadCalendar() {
      if (!career) return;
      try {
        if (window.api?.calendar) {
          const evs = await window.api.calendar.getEvents(career.id);
          setEvents(evs || []);
        }
        if (window.api?.fixtures) {
          const fixs = await window.api.fixtures.getUpcoming(team?.id || '', '2025-01-01');
          setFixtures(fixs || []);
        }
      } catch (err) {
        console.error('Failed to load calendar', err);
      }
    }
    loadCalendar();
  }, [career, team, currentDate]);

  const handleAdvanceDay = async () => {
    setAdvancing(true);
    const res = await advanceDay();
    setAdvancing(false);
  };

  const handleAdvanceEvent = async () => {
    setAdvancing(true);
    const res = await advanceToNextEvent();
    setAdvancing(false);
  };

  // Generate 28-day window around current date
  const daysArray: { dateStr: string; dayNum: number; isCurrent: boolean }[] = [];
  for (let i = -7; i < 21; i++) {
    const str = addDays(currentDate, i);
    daysArray.push({
      dateStr: str,
      dayNum: Number(str.slice(-2)),
      isCurrent: str === currentDate,
    });
  }

  const selectedFixtures = fixtures.filter((f) => f.scheduledDate === selectedDate);
  const selectedEvents = events.filter((e) => e.date === selectedDate);

  return (
    <div className="calendar-page">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="calendar-header">
        <div>
          <h1 className="page-heading">SEASON CALENDAR & TIMELINE</h1>
          <p className="page-subheading">
            Track scheduled Regional Opens, transfer deadlines, training cycles, and World Championship
            stages.
          </p>
        </div>

        <div className="calendar-controls">
          <button className="btn btn-secondary" onClick={handleAdvanceDay} disabled={advancing}>
            📅 Advance 1 Day
          </button>
          <button className="btn btn-primary" onClick={handleAdvanceEvent} disabled={advancing}>
            ⏩ Advance to Next Event
          </button>
        </div>
      </div>

      <div className="current-date-banner">
        <span>CURRENT CAREER DATE: <strong>{currentDate}</strong></span>
      </div>

      {/* Interactive Horizontal / Grid Calendar View */}
      <div className="calendar-grid-container">
        <div className="calendar-grid">
          {daysArray.map((day) => {
            const hasMatch = fixtures.some((f) => f.scheduledDate === day.dateStr);
            const hasEvent = events.some((e) => e.date === day.dateStr);

            return (
              <div
                key={day.dateStr}
                className={`cal-day-cell ${day.isCurrent ? 'current-day' : ''} ${
                  selectedDate === day.dateStr ? 'selected-day' : ''
                }`}
                onClick={() => setSelectedDate(day.dateStr)}
              >
                <div className="cal-day-top">
                  <span className="cal-day-num">{day.dayNum}</span>
                  {day.isCurrent && <span className="today-badge">TODAY</span>}
                </div>

                <div className="cal-day-events">
                  {hasMatch && (
                    <span className="event-pill match-pill">⚔️ Match</span>
                  )}
                  {hasEvent && (
                    <span className="event-pill note-pill">📌 Event</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Agenda Detail */}
      <div className="day-agenda-panel">
        <h3 className="agenda-title">
          AGENDA FOR <strong>{selectedDate}</strong>
        </h3>

        <div className="agenda-items-list">
          {selectedFixtures.map((f) => (
            <div key={f.id} className="agenda-item match-agenda">
              <span className="agenda-type">SCHEDULED TOURNAMENT FIXTURE</span>
              <div className="agenda-main">
                <span className="agenda-match-names">
                  {f.homeTeamName || 'My Team'} vs {f.awayTeamName || 'Opponent'}
                </span>
                <span className="agenda-series">Best of {String(f.seriesFormat || 'BO5').replace(/\D/g, '')}</span>
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={f.scheduledDate > currentDate}
                onClick={() => navigate(`/match-day/${f.id}`)}
              >
                {f.scheduledDate <= currentDate ? 'Go to Match Day →' : 'Advance to this date first'}
              </button>
            </div>
          ))}

          {selectedEvents.map((e) => (
            <div key={e.id} className="agenda-item note-agenda">
              <span className="agenda-type">{e.type?.toUpperCase()}</span>
              <div className="agenda-main">
                <strong>{e.title}</strong>
                <p>{e.description}</p>
              </div>
            </div>
          ))}

          {selectedFixtures.length === 0 && selectedEvents.length === 0 && (
            <div className="agenda-empty">
              No competitive events on this date. Squad participates in scheduled training regimen.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
