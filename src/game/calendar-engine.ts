export function advanceDay(career: any) {
  const currentDate = new Date(career.currentDate);
  currentDate.setDate(currentDate.getDate() + 1);
  career.currentDate = currentDate.toISOString();
  
  return processDay(career, currentDate);
}

export function advanceToNextEvent(career: any, events: any[]) {
  const futureEvents = events.filter(e => new Date(e.date) > new Date(career.currentDate));
  if (futureEvents.length === 0) return advanceDay(career);
  
  futureEvents.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextEvent = futureEvents[0];
  
  career.currentDate = nextEvent.date;
  return processDay(career, new Date(nextEvent.date));
}

export function processDay(career: any, date: Date) {
  const updates = {
    messages: [] as any[],
    actionsRequired: [] as string[]
  };

  // 1. Check for matches today
  // 2. Process daily training recovery/fatigue
  // 3. Check contract expirations
  
  if (date.getDay() === 1) { // Monday weekly review
    updates.messages.push({
      type: 'WEEKLY_REPORT',
      title: 'Weekly Financial & Training Report',
      body: 'Check your team\'s progress.'
    });
  }

  return updates;
}
