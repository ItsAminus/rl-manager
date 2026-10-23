"""Series stakes come from saved game results, never the current goal score."""
class SeriesStory:
    def __init__(self, context, teams):
        self.teams = teams
        data = context.get('series')
        self.enabled = bool(data)
        if not data:
            return
        self.best_of = int(data['bestOf'])
        if self.best_of not in (1, 2, 3, 5, 7, 9):
            raise ValueError('Invalid best-of format')
        self.required = self.best_of // 2 + 1
        self.wins = (int(data['blueWins']), int(data['orangeWins']))
        self.history = data.get('history', [])
        self.game = int(data['gameNumber'])
        if min(self.wins) < 0 or max(self.wins) >= self.required or self.game != sum(self.wins)+1 or (self.best_of == 2 and self.game > 2):
            raise ValueError('Series is complete or game number is inconsistent')

    def stakes(self):
        if not self.enabled:
            return ''
        a, b = self.wins
        if self.best_of == 2:
            return (f'Game {self.game} of this two-game group matchup. Both games count. '
                    'A two-nil win earns three points; a one-one split earns each nation one point.')
        opening = f'Game {self.game} of this best of {self.best_of}. '
        if a == b:
            opening += f'The series is level at {a} apiece. '
        else:
            lead = 0 if a > b else 1
            opening += f'{self.teams[lead]} lead the series {max(a,b)} to {min(a,b)}. '
        points = [i for i, w in enumerate(self.wins) if w == self.required-1]
        if len(points) == 2:
            return opening + 'This is the deciding game! One win takes the entire series.'
        if points:
            lead = points[0]
            return opening + f'{self.teams[lead]} are on series point! {self.teams[1-lead]} have to win this game to stay alive. The response has to start now!'
        return opening + 'Every game brings the winner one step closer. Set the tone and make this one count!'

    def postgame(self, score, events=()):
        if score[0] == score[1]:
            return ''  # an aborted/tied packet is not a completed win
        winner = 0 if score[0] > score[1] else 1
        name = self.teams[winner]
        if not self.enabled:
            return f'{name} take the game, {max(score)} to {min(score)}! That is the final result. What a battle!'
        wins = list(self.wins)
        wins[winner] += 1
        opening = f'{name} take game {self.game}! '
        if self.best_of == 2:
            if self.game == 1:
                return opening + 'The second game still has to be played. Three points or a shared point are still on the line!'
            if wins[0] == wins[1]:
                return opening + 'The matchup finishes one-one. Each nation earns one group point!'
            return opening + f'{name} win the matchup two-nil and earn all three group points!'
        if any(e.get('type') == 'goal' and e.get('score', (0,0))[1-winner] - e.get('score', (0,0))[winner] >= 2 for e in events):
            opening += 'They have turned a two-goal deficit into a game win! '
        if wins[winner] >= self.required:
            reverse = (self.required > 1 and len(self.history) >= self.required-1 and
                       all(g['winner'] == 1-winner for g in self.history[:self.required-1]))
            opening += (f'The reverse sweep is complete! {name} win the series ' if reverse else f'{name} win the series ')
            return opening + f'{wins[winner]} to {wins[1-winner]}! They have finished the job. What a way to close it out!'
        if self.wins[1-winner] == self.required-1:
            opening += 'They survive series point! The comeback stays alive. '
        if wins[0] == wins[1]:
            opening += f'The series is now level at {wins[0]} apiece! '
        else:
            lead = 0 if wins[0] > wins[1] else 1
            opening += f'{self.teams[lead]} now lead the series {wins[lead]} to {wins[1-lead]}. '
        if min(wins) == self.required-1:
            return opening + 'We are going to a deciding game! Everything is on the next result!'
        if wins[winner] == self.required-1:
            return opening + f'{name} move onto series point! One more game will finish it.'
        return opening + 'There is still work to do. Carry that momentum into the next game!'
