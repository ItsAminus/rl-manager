import type { AppDatabase } from './database';
import { v4 as uuid } from 'uuid';
import { addDays, wageDemands } from '../game/career-rules';
import {careerWindow} from './transfer-calendar';
import {recruitmentInterest} from './recruitment-interest';

const active = "('pending','countered','player_talks')";
const money = (n: unknown) => {
  if (!Number.isSafeInteger(n) || Number(n) < 0 || Number(n) > 100000000)
    throw new Error('Enter a valid whole-dollar amount.');
  return Number(n);
};
// Stable career simulation: reopening a screen never rerolls interest or consent.
function roll(key: string) {
  let hash = 2166136261;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  // Mix the final bits too: neighbouring calendar dates must not produce
  // nearly identical interest decisions for the same club.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
export class OutgoingTransfers {
  constructor(private db: AppDatabase) {}
  private career(id: string) {
    const c = this.db.prepare('SELECT * FROM careers WHERE id = ?').get(id);
    if (!c) throw new Error('Career not found');
    if(this.db.prepare('SELECT mode FROM career_modes WHERE careerId=?').get(id)?.mode==='Path To Glory')throw Error('Transfers are unavailable in Path To Glory.');
    return c;
  }
  private notify(c: any, title: string, body: string) {
    this.db
      .prepare(
        'INSERT INTO inbox_items (id,careerId,date,type,title,body,isRead,actions) VALUES (?,?,?,?,?,?,0,?)'
      )
      .run(
        uuid(),
        c.id,
        c.currentDate,
        'transfer_offer',
        title,
        body,
        JSON.stringify([
          { label: 'Review offer', action: 'navigate', data: { href: '/transfers?tab=outgoing' } },
        ])
      );
  }
  private ownPlayer(c: any, id: string) {
    const p = this.db
      .prepare('SELECT * FROM players WHERE id = ? AND teamId = ?')
      .get(id, c.teamId);
    if (!p) throw new Error('Choose a player from your own club.');
    return p;
  }
  overview(id: string) {
    const c = this.career(id);
    return {
      listings: this.db
        .prepare(
          'SELECT l.*,p.gamertag FROM transfer_listings l JOIN players p ON p.id=l.playerId WHERE l.careerId=? AND p.teamId=?'
        )
        .all(id, c.teamId),
      offers: this.db
        .prepare(
          'SELECT o.*,p.gamertag,t.name AS buyerName FROM outgoing_offers o JOIN players p ON p.id=o.playerId JOIN teams t ON t.id=o.buyerId WHERE o.careerId=? ORDER BY o.createdDate DESC,o.id'
        )
        .all(id),
    };
  }
  list(id: string, playerId: string, askingPrice: unknown, listed: boolean) {
    return this.db.transaction(() => {
      const c = this.career(id),
        p = this.ownPlayer(c, playerId);
      if (listed) {
        const fee = money(askingPrice),
          existing = this.db
            .prepare('SELECT playerId FROM transfer_listings WHERE careerId=? AND playerId=?')
            .get(id, playerId);
        this.db
          .prepare(
            `INSERT INTO transfer_listings (careerId,playerId,askingPrice,listedDate,lastApproachDate) VALUES (?,?,?,?,NULL)
          ON CONFLICT(careerId,playerId) DO UPDATE SET askingPrice=excluded.askingPrice`
          )
          .run(id, playerId, fee, c.currentDate);
        if (!existing) {
          const requested=this.db.prepare('SELECT transferRequested FROM manager_relationships WHERE careerId=? AND playerId=?').get(id,playerId);
          if(!requested?.transferRequested)this.db.prepare('UPDATE players SET morale=MAX(0,morale-4) WHERE id=?').run(playerId);
          this.notify(
            c,
            `${p.gamertag} listed for transfer`,
            'Clubs will assess the asking price, squad needs and finances during the transfer window. Interest is not guaranteed.'
          );
        }
      } else {
        this.db
          .prepare('DELETE FROM transfer_listings WHERE careerId=? AND playerId=?')
          .run(id, playerId);
        this.db
          .prepare(
            `UPDATE outgoing_offers SET status='withdrawn',reason='Seller withdrew the player from the market.' WHERE careerId=? AND playerId=? AND status IN ${active}`
          )
          .run(id, playerId);
      }
      return { success: true };
    })();
  }
  respond(id: string, offerId: string, action: string, counterFee?: unknown) {
    return this.db.transaction(() => {
      const c = this.career(id),
        o = this.db
          .prepare('SELECT * FROM outgoing_offers WHERE id=? AND careerId=?')
          .get(offerId, id);
      if (!o || !['pending', 'countered'].includes(o.status))
        throw new Error('This offer is no longer awaiting your reply.');
      const p = this.ownPlayer(c, o.playerId);
      if (!careerWindow(this.db,id,c.currentDate).open || o.expiresDate < c.currentDate)
        throw new Error('This offer has expired or the transfer window is closed.');
      if (action === 'reject') {
        this.db
          .prepare(
            "UPDATE outgoing_offers SET status='rejected',reason='Rejected by your club.' WHERE id=?"
          )
          .run(o.id);
        return { success: true };
      }
      if (o.status === 'countered')
        throw new Error('Wait for the buying club to respond to your counteroffer.');
      if (action === 'counter') {
        const fee = money(counterFee);
        if (fee <= o.fee) throw new Error('A counteroffer must be higher than the current offer.');
        if (o.rounds >= 2) throw new Error('The buying club has made its final offer.');
        this.db
          .prepare(
            "UPDATE outgoing_offers SET status='countered',fee=?,responseDate=?,rounds=rounds+1,reason='Buyer is considering your counteroffer.' WHERE id=?"
          )
          .run(fee, addDays(c.currentDate, 1), o.id);
        return { success: true };
      }
      if (action !== 'accept') throw new Error('Choose accept, reject or counter.');
      if (o.status === 'countered')
        throw new Error('Wait for the buying club to respond to your counteroffer.');
      const needsReplacement = this.db.prepare('SELECT COUNT(*) AS n FROM players WHERE teamId=?').get(c.teamId).n <= 3;
      // Deadline-day offers must be decided today, rather than expiring while
      // waiting for a response scheduled outside the transfer window.
      const responseDate = [addDays(c.currentDate, 2), o.expiresDate, careerWindow(this.db,id,c.currentDate).closes!].sort()[0];
      const reason = needsReplacement
        ? 'Fee agreed. Sign a replacement before this sale can complete; your club must retain three players.'
        : 'Club fee agreed; player and agent are discussing the contract.';
      this.db
        .prepare(
          "UPDATE outgoing_offers SET status='player_talks',responseDate=?,reason=? WHERE id=?"
        )
        .run(responseDate, reason, o.id);
      this.notify(
        c,
        `${p.gamertag}: fee agreed`,
        'The transfer is subject to player consent and the buying club still having sufficient funds. Advance the calendar for their decision.'
      );
      if (responseDate === c.currentDate) this.tick(id);
      const resolved = this.db.prepare('SELECT status,reason FROM outgoing_offers WHERE id=?').get(o.id);
      return { success: true, message: resolved.reason, status: resolved.status };
    })();
  }
  tick(id: string) {
    const c = this.career(id),
      window = careerWindow(this.db,id,c.currentDate);
    for (const o of this.db
      .prepare(`SELECT * FROM outgoing_offers WHERE careerId=? AND status IN ${active}`)
      .all(id)) {
      const p = this.db.prepare('SELECT * FROM players WHERE id=?').get(o.playerId);
      if (!p || p.teamId !== c.teamId || !window.open || o.expiresDate < c.currentDate) {
        this.db
          .prepare(
            "UPDATE outgoing_offers SET status='expired',reason='Offer expired or the player is no longer available.' WHERE id=?"
          )
          .run(o.id);
        continue;
      }
      if (!o.responseDate || o.responseDate > c.currentDate) continue;
      const buyer = this.db.prepare('SELECT * FROM teams WHERE id=?').get(o.buyerId);
      if (o.status === 'countered') {
        if (o.fee > o.ceiling) {
          this.db
            .prepare(
              "UPDATE outgoing_offers SET status='withdrawn',reason='Your counteroffer exceeds the buyer’s valuation or budget.' WHERE id=?"
            )
            .run(o.id);
          this.notify(
            c,
            `${p.gamertag}: talks ended`,
            `${buyer.name} withdrew after your counteroffer.`
          );
        } else {
          this.db
            .prepare(
              "UPDATE outgoing_offers SET status='pending',responseDate=NULL,reason='Buyer accepted your counteroffer. Your approval is required.' WHERE id=?"
            )
            .run(o.id);
          this.notify(
            c,
            `${p.gamertag}: revised offer`,
            `${buyer.name} agreed to $${o.fee.toLocaleString()}. Accept to begin player talks.`
          );
        }
        continue;
      }
      if (o.status !== 'player_talks') continue;
      const seller = this.db.prepare('SELECT * FROM teams WHERE id=?').get(c.teamId);
      const relation = this.db
        .prepare(
          'SELECT transferRequested FROM manager_relationships WHERE careerId=? AND playerId=?'
        )
        .get(id, p.id);
      const current = this.db
        .prepare('SELECT * FROM contracts WHERE playerId=? AND isActive=1')
        .get(p.id);
      const willingness = Math.min(
        0.95,
        Math.max(
          0.12,
          0.62 +
            ((buyer.reputation || 50) - (seller.reputation || 50)) * 0.008 +
            (relation?.transferRequested ? 0.22 : 0) +
            (p.morale < 45 ? 0.12 : 0) +
            (buyer.region !== p.region ? -0.12 : 0)
        )
      );
      let reason = '';
      const interest=recruitmentInterest(this.db,id,buyer.id,p,c.currentDate);
      if(!interest.willing)reason=interest.reasons[0];
      if (!reason&&(roll(o.id + ':consent') > willingness || o.salary < (current?.salary || 0) * 0.9))
        reason =
          'The player declined the move: contract terms, club ambition or relocation did not suit them.';
      else if (!reason&&buyer.cashBalance < o.fee + o.bonus + o.salary)
        reason = 'The buying club can no longer fund the fee and contract.';
      if (!reason && this.db.prepare('SELECT COUNT(*) AS n FROM players WHERE teamId=?').get(c.teamId).n <= 3) {
        this.db.prepare("UPDATE outgoing_offers SET reason='Fee agreed; awaiting a replacement. Sign another player before the offer expires to retain three players.' WHERE id=?").run(o.id);
        continue;
      }
      if (!reason && (
        this.db
          .prepare(
            "SELECT f.id FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND f.status='in_progress' AND (f.homeTeamId IN (?,?) OR f.awayTeamId IN (?,?)) LIMIT 1"
          )
          .get(id, c.teamId, buyer.id, c.teamId, buyer.id)
      )) {
        this.db.prepare("UPDATE outgoing_offers SET reason='Fee agreed; completion waits until the current series finishes.' WHERE id=?").run(o.id);
        continue;
      }
      if (reason) {
        this.db
          .prepare("UPDATE outgoing_offers SET status='failed',reason=? WHERE id=?")
          .run(reason, o.id);
        this.notify(c, `${p.gamertag}: transfer fell through`, reason);
        continue;
      }
      const end = new Date(c.currentDate + 'T12:00:00Z');
      end.setUTCMonth(end.getUTCMonth() + o.duration);
      this.db.prepare('UPDATE contracts SET isActive=0 WHERE playerId=?').run(p.id);
      this.db
        .prepare(
          'INSERT INTO contracts (id,playerId,teamId,salary,duration,startDate,endDate,signingBonus,buyout,isActive) VALUES (?,?,?,?,?,?,?,?,?,1)'
        )
        .run(
          uuid(),
          p.id,
          buyer.id,
          o.salary,
          o.duration,
          c.currentDate,
          end.toISOString().slice(0, 10),
          o.bonus,
          Math.round(o.fee * 1.5)
        );
      this.db.prepare('UPDATE teams SET cashBalance=cashBalance+? WHERE id=?').run(o.fee, c.teamId);
      this.db
        .prepare('UPDATE teams SET cashBalance=cashBalance-? WHERE id=?')
        .run(o.fee + o.bonus + o.salary, buyer.id);
      this.db
        .prepare('UPDATE players SET teamId=?,morale=MIN(100,morale+5) WHERE id=?')
        .run(buyer.id, p.id);
      this.db
        .prepare(
          "INSERT INTO player_affiliations (playerId,status,note) VALUES (?,'career','Transferred in this simulated career.') ON CONFLICT(playerId) DO UPDATE SET status='career',note=excluded.note"
        )
        .run(p.id);
      this.db
        .prepare(
          'INSERT INTO transfers (id,playerId,fromTeamId,toTeamId,fee,date,type,careerId) VALUES (?,?,?,?,?,?,?,?)'
        )
        .run(uuid(), p.id, c.teamId, buyer.id, o.fee, c.currentDate, 'sale',c.id);
      this.db
        .prepare(
          "UPDATE outgoing_offers SET status='completed',reason='Fee and player contract agreed. Transfer completed.' WHERE id=?"
        )
        .run(o.id);
      this.db
        .prepare(
          `UPDATE outgoing_offers SET status='withdrawn',reason='Player joined another club.' WHERE careerId=? AND playerId=? AND id!=? AND status IN ${active}`
        )
        .run(id, p.id, o.id);
      this.db
        .prepare('DELETE FROM transfer_listings WHERE careerId=? AND playerId=?')
        .run(id, p.id);
      // Rebuild both saved lineups after the roster move, without borrowing players.
      this.db
        .prepare(
          'DELETE FROM career_lineup WHERE careerId IN (SELECT id FROM careers WHERE teamId IN (?,?))'
        )
        .run(c.teamId, buyer.id);
      this.db
        .prepare(
          'UPDATE manager_relationships SET transferRequested=0 WHERE careerId=? AND playerId=?'
        )
        .run(id, p.id);
      this.notify(
        c,
        `${p.gamertag}: sale completed`,
        `${buyer.name} paid $${o.fee.toLocaleString()}. The player agreed to a ${o.duration}-month contract. Your wage bill has been reduced.`
      );
    }
    if (!window.open) return;
    for (const l of this.db
      .prepare(
        'SELECT l.*,p.* FROM transfer_listings l JOIN players p ON p.id=l.playerId WHERE l.careerId=? AND p.teamId=?'
      )
      .all(id, c.teamId)) {
      if (
        (l.lastApproachDate && addDays(l.lastApproachDate, 7) > c.currentDate) ||
        this.db
          .prepare(
            `SELECT id FROM outgoing_offers WHERE careerId=? AND playerId=? AND status IN ${active}`
          )
          .get(id, l.playerId)
      )
        continue;
      this.db
        .prepare('UPDATE transfer_listings SET lastApproachDate=? WHERE careerId=? AND playerId=?')
        .run(c.currentDate, id, l.playerId);
      const demand = wageDemands(l),
        current = this.db
          .prepare('SELECT salary FROM contracts WHERE playerId=? AND isActive=1')
          .get(l.playerId);
      const salary = Math.max(demand.salary, Math.round((current?.salary || 0) * 1.05)),
        bonus = demand.bonus;
      const clubs = this.db
        .prepare(
          `SELECT t.*,COUNT(p.id) AS size,COALESCE(AVG(p.overall),0) AS strength,COALESCE(MIN(p.overall),0) AS weakest FROM teams t
        LEFT JOIN players p ON p.teamId=t.id LEFT JOIN team_roster_sources rs ON rs.teamId=t.id
        WHERE t.id!=? AND t.region=? AND (rs.status IS NULL OR rs.status='active') AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id=t.id)
        GROUP BY t.id HAVING size BETWEEN 2 AND 5 AND weakest <= ? AND strength BETWEEN ? AND ? ORDER BY reputation DESC LIMIT 120`
        )
        .all(c.teamId, l.region, l.overall + 2, l.overall - 18, l.overall + 8);
      const candidates = clubs
        .map((t) => {
          const valuation = Math.round(
            (l.marketValue || 40000) *
              (1 + ((l.form ?? 50) - 50) * 0.004) *
              (t.size < 3 ? 1.15 : 0.95)
          );
          const ceiling = Math.min(
            Math.round(valuation * 1.25),
            Math.max(0, Math.floor(t.cashBalance * 0.45) - salary - bonus)
          );
          return {
            t,
            valuation,
            ceiling,
            interest: roll(`${id}:${l.playerId}:${t.id}:${c.currentDate}`),
          };
        })
        .filter((x) => x.ceiling > 0 && l.askingPrice <= x.ceiling && x.interest < 0.4)
        .sort((a, b) => b.ceiling - a.ceiling);
      const candidate = candidates[0];
      if (!candidate) continue;
      const fee = Math.min(
        candidate.ceiling,
        Math.max(0, Math.round(Math.min(l.askingPrice, candidate.valuation) * 0.88))
      );
      const expires = [addDays(c.currentDate, 5), window.closes!].sort()[0];
      this.db
        .prepare(
          'INSERT INTO outgoing_offers (id,careerId,playerId,sellerId,buyerId,fee,ceiling,salary,bonus,duration,status,createdDate,expiresDate,rounds,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)'
        )
        .run(
          uuid(),
          id,
          l.playerId,
          c.teamId,
          candidate.t.id,
          fee,
          candidate.ceiling,
          salary,
          bonus,
          12,
          'pending',
          c.currentDate,
          expires,
          'Club offer received. Player terms are not yet agreed.'
        );
      this.notify(
        c,
        `Offer for ${l.gamertag}`,
        `${candidate.t.name} offer $${fee.toLocaleString()}. Reply by ${expires}. You may accept, reject or negotiate the fee.`
      );
    }
  }
}
