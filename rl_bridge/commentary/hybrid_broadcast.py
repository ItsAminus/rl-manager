"""Recorded reactions + asynchronous, locally generated Chatterbox analysis."""
from collections import deque
import hashlib
import os
import json
import queue
import re
from pathlib import Path
import subprocess
import threading
import time

from clip_broadcast import ClipBroadcast, PRIORITY, GOALS, REACTIONS
from match_story import MatchStory, clock_phase
from story_lines import discussion_lines
from runtime_paths import speech_pythons

ROOT = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('RLM_AI_RUNTIME', str(ROOT.parent / 'local_runtime')))
CRITICAL = REACTIONS


def speech_style(speaker, energy='lively'):
    # Original English Chatterbox uses conditioning parameters, not Turbo tags.
    return {'exaggeration': .85 if energy == 'hype' else .72 if speaker == 'caster_two' else .78,
            'cfg_weight': .3 if energy == 'hype' else .35, 'temperature': .8}


class SpeechWorker:
    def __init__(self, log, stop_event=None):
        self.log = log
        self.stop_event = stop_event or threading.Event()
        self.candidates = speech_pythons(RUNTIME)
        self.candidate_index = 0
        self.close_lock = threading.Lock()
        self.stderr = (ROOT / "cache" / "hybrid_speech.log").open("a", encoding="utf-8")
        self.job_id = 0
        self.ready = False
        try:
            self._start()
        except OSError:
            if len(self.candidates) < 2:
                self.stderr.close()
                raise
            self.candidate_index = 1
            self.log('Hybrid commentary: optional GPU speech executable could not start; using bundled CPU runtime')
            self._start(force_cpu=True)

    def _start(self, force_cpu=False):
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)
        environment = dict(os.environ)
        if force_cpu:
            environment['RLM_SPEECH_DEVICE'] = 'cpu'
        self.process = subprocess.Popen([str(self.candidates[self.candidate_index]),
                                         "-u", str(ROOT / "chatterbox_worker.py")],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.stderr,
                                        text=True, encoding="utf-8", creationflags=flags, env=environment)
        messages = self.messages = queue.Queue()
        process = self.process
        def read_responses():
            try:
                for line in process.stdout:
                    messages.put(line)
            finally:
                messages.put(None)
        threading.Thread(target=read_responses, name='speech-responses', daemon=True).start()

    def _response(self, timeout):
        deadline = time.monotonic() + timeout
        while not self.stop_event.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                self._close_process()
                raise TimeoutError('Caster speech exceeded its background generation budget')
            try:
                line = self.messages.get(timeout=min(.25, remaining))
            except queue.Empty:
                continue
            if line is None:
                raise RuntimeError('Chatterbox stopped; see hybrid_speech.log')
            return json.loads(line)
        raise RuntimeError('Commentary generation cancelled')

    def wait_ready(self):
        if self.ready:
            return
        while True:
            try:
                ready = self._response(180)
                if ready.get('error'):
                    raise RuntimeError(ready['error'])
                if ready.get('status') != 'ready':
                    raise RuntimeError('Invalid speech runtime startup response')
                break
            except Exception:
                self._close_process()
                if self.stop_event.is_set() or self.candidate_index + 1 >= len(self.candidates):
                    raise
                self.candidate_index += 1
                self.log('Hybrid commentary: optional GPU speech runtime failed; keeping Caster One/Caster Two on bundled CPU runtime')
                self._start(force_cpu=True)
        self.backend = ready.get('backend', 'cuda')
        self.log(f"Hybrid commentary speech ready: Chatterbox on {ready.get('device')}; "
                 f"backend={self.backend}; gameplay pacing on {ready.get('paced_modules', 0)} model stages")
        if ready.get('fallback'):
            self.log('Hybrid commentary compute: ' + ready['fallback'])
        self.ready = True

    def synthesize(self, speaker, text, output, style=None):
        if output.exists():
            return output
        self.wait_ready()
        self.job_id += 1
        request = {"id": self.job_id, "speaker": speaker, "text": text,
                   "output": str(output), **(style or speech_style(speaker))}
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        result = self._response(240 if self.backend == 'cpu' else 180)
        if result.get("error"):
            raise RuntimeError(result["error"])
        if result.get('id') != self.job_id:
            raise RuntimeError('Speech response does not match this commentary request')
        self.log(f"Hybrid commentary READY ({speaker}): audio={result.get('seconds', 0):.1f}s; "
                 f"generation={result.get('generation_seconds', 0):.1f}s; "
                 f"GPU breathing room={result.get('gameplay_yield_seconds', 0):.1f}s")
        return Path(result["file"])

    def _close_process(self):
        with self.close_lock:
            self._close_process_locked()

    def _close_process_locked(self):
        if self.process.poll() is None:
            # Windows venv launchers can start a second Python process. Stop
            # only this owned PID's tree, so CPU speech cannot outlive a match.
            if os.name == 'nt':
                try:
                    subprocess.run([str(Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/taskkill.exe'),
                                    '/PID',str(self.process.pid),'/T','/F'],
                                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=3)
                except (OSError,subprocess.TimeoutExpired):
                    pass
            if self.process.poll() is None:
                self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        for stream in (self.process.stdin, self.process.stdout):
            if stream:
                stream.close()

    def close(self):
        self._close_process()
        self.stderr.close()


class HybridBroadcast(ClipBroadcast):
    def __init__(self, context=None, log=print, start_background=True, **kwargs):
        super().__init__(log=log, **kwargs)
        self.story = MatchStory(context)
        self.snapshot = None
        self.story_lock = threading.Lock()
        self.stopped = threading.Event()
        self.ready_line = None
        self.intro_lines = deque()
        self.postgame_lines = deque()
        self.intro_prepared = threading.Event()
        self.postgame_complete = threading.Event()
        self.intro_done = False
        self.intro_started = False
        self.intro_deadline = None
        self.intro_ready = threading.Event()
        self.postgame_ready = threading.Event()
        self.postgame_prepared = False
        self.final_snapshot = None
        self.result_openers = {}
        self.preview_keys = set()
        self.prepared_review = {}
        self.review_milestones = {}
        self.intro_enabled = bool((context or {}).get("blueTeam"))
        from player_introductions import introduction_plan
        self.presentation_plan = introduction_plan(context or {})
        self.presentation_lines = {}
        self.presentation_prepared = threading.Event()
        self.presentation_finished = threading.Event()
        if not self.presentation_plan:
            self.presentation_finished.set()
        self.generation = 0
        self.history = deque(maxlen=40)
        self.topic_history = deque(maxlen=6)
        self.subject_history = deque(maxlen=3)
        self.discussion_number = 0
        self.last_analysis = 0
        self.last_review_prepare = -1000
        self.next_speaker = "caster_two"
        self.speech = None
        self.selector = None
        self.generation_thread = threading.Thread(target=self._generate, name="chatterbox-producer", daemon=True)
        self._load_reflexes()
        if start_background:
            self.generation_thread.start()
        self.log(f"Hybrid commentary ACTIVE: discussion v10; final-minute result preparation; prepared result desk without a generation wait; runtime={Path(__file__).resolve()}")

    def _load_reflexes(self):
        # Only this curated new bank, not the old bank's guessed mechanics.
        for file in sorted((ROOT / "hybrid_voice_bank").glob("*.wav")):
            category = file.stem.rsplit("_", 1)[0]
            if category not in PRIORITY:
                continue
            self.bank.clips[file.stem] = self.bank._load(file, self.player.sample_rate)
            ids = self.bank.categories.setdefault(category, [])
            if file.stem not in ids:
                ids.append(file.stem)

    def _event(self, category, owner=None, team=None):
        now = self.clock()
        self._refresh_finished(now)
        if category in GOALS and self.goal_player:
            return super()._event(category, owner, team)
        analysis_on_air = self.player.busy and self.current and self.current[0] == 'analysis'
        if analysis_on_air:
            if category not in CRITICAL or not self.bank.categories.get(self.bank.recording_category(category)):
                return False
            if now - self.last_event.get(category, -1000) < 2:
                return False
            accepted = super()._event(category, owner, team)
            if accepted:
                # A matching recording is queued BEFORE fading the analysis.
                # Routine plays and missing reaction clips never cause cuts.
                with self.story_lock:
                    self.ready_line = None
                if self.current and self.current[0] == 'analysis':
                    self.player.interrupt()
                self.log(f'Hybrid commentary critical transition: {category}')
            return accepted
        if category not in CRITICAL and category != 'kickoff' and self.ready_line:
            return False  # give the prepared discussion its next natural turn
        return super()._event(category, owner, team)

    def _refresh_finished(self, now):
        if self.was_busy and not self.player.busy:
            category = self.current[0] if self.current else ''
            self.log(f'Hybrid commentary END: {category} (native audio acknowledged)')
            self.current = None
            self.was_busy = False
            self.next_ambient = now + (.28 if category == 'analysis' else .55)

    def _invalidate_pending(self, now, keep_goal=False):
        if not (keep_goal and self.pending and self.pending[0] in
                {'goal', 'winner', 'equalizer', 'late_goal'}):
            self.pending = None
        self.next_ambient = now + .55

    def _play_script(self, category, complete, timeout):
        """Stream prepared sentences without cutting any audio already on air."""
        deadline = time.monotonic() + timeout
        queue = self.intro_lines if category == 'intro' else self.postgame_lines
        while not self.stopped.is_set():
            now = self.clock()
            if self.pending and self.pending[0] not in CRITICAL:
                self.pending = None  # ordinary plays expire at the result desk
            self._service_pending(now)
            with self.story_lock:
                done = complete.is_set() and not queue
            countdown_busy = self.countdown_player and self.countdown_player.busy
            goal_busy = self.goal_player and self.goal_player.busy
            if done and not self.player.busy and not self.goal_calls and not countdown_busy and not goal_busy:
                return True
            # Check before starting another sentence. An already playing one
            # is allowed to finish even when the preparation budget expires.
            if time.monotonic() >= deadline and not self.player.busy and not self.goal_calls and not countdown_busy and not goal_busy:
                return False
            if not self.player.busy and not countdown_busy and not goal_busy:
                with self.story_lock:
                    # Reflex events are no longer relevant during this desk segment.
                    if self.pending and self.pending[0] not in CRITICAL:
                        self.pending = None
                self._play_ready(now, intro_only=category == 'intro', script=category)
            self.stopped.wait(.02)
        return False

    def prepare_intro(self, timeout=0):
        """Arm loading-period speech without delaying bots, stadium or kickoff."""
        if not self.intro_enabled:
            self.intro_done = True
            return
        if self.intro_started:
            return
        self.intro_started = True
        self.intro_deadline = time.monotonic() + 20
        self.loading_thread = threading.Thread(target=self._loading_intro, name='loading-intro', daemon=True)
        self.loading_thread.start()
        self.log("Hybrid commentary: intro preparing in background; match launch continues")

    def presentation_audio(self, index):
        with self.story_lock:
            return self.presentation_lines.get(index)

    def play_presentation_audio(self, pcm):
        if not self.player.busy:
            self.player.play(pcm, interruptible=True)

    def finish_player_showcase(self, played=False):
        # Only showcase speech is playing at this point. A skip must not leave
        # an introduction talking over the hosted connection or first kickoff.
        self.player.interrupt()
        self.presentation_finished.set()
        if played:
            self.intro_done = True
            self.intro_enabled = False

    def _prepare_player_showcase(self):
        try:
            for index, player in enumerate(self.presentation_plan):
                if self.stopped.is_set() or self.presentation_finished.is_set():
                    break
                from introduction_voice_bank import load_player_audio, assemble_player_audio
                pieces = load_player_audio(ROOT / 'player_intros', player, index,
                         lambda path:self.bank._load(path, self.player.sample_rate, preserve_full=True))
                if not pieces:
                    continue
                pcm = assemble_player_audio(pieces,self.player.sample_rate)
                if 1 <= len(pcm) / self.player.sample_rate <= 59:
                    with self.story_lock:
                        self.presentation_lines[index] = pcm
        except Exception as exc:
            self.log(f'Player introduction speech unavailable ({exc}); player cards remain available')
        finally:
            self.presentation_prepared.set()
        while not self.stopped.is_set() and not self.presentation_finished.wait(.1):
            pass

    def _loading_intro(self):
        while not self.stopped.is_set() and not self.intro_done:
            if time.monotonic() >= self.intro_deadline:
                self.intro_done = True
                break
            now = self.clock()
            self._refresh_finished(now)
            if not self.player.busy:
                self._play_ready(now, intro_only=True, script='intro')
            if self.intro_prepared.is_set() and not self.intro_lines:
                self.intro_done = True
                break
            self.stopped.wait(.02)
        with self.story_lock:
            self.intro_lines.clear()

    def _make_script(self, speaker, text, category, version):
        # Whole sentences keep player names/series facts intact and let the first
        # line play while later lines are still synthesizing on the GPU.
        # A gamertag such as "ajg. has" is part of a sentence, not a breath break.
        sentences = self._sentences(text)
        for sentence in sentences:
            if self.stopped.is_set() or (category == 'review_preview' and self.final_snapshot):
                break
            if category == 'intro' and self.intro_done:
                break
            try:
                self._make_line(speaker, sentence, category, version, None)
            except Exception as exc:
                self.log(f'Hybrid commentary warning: {category} sentence could not be generated ({exc})')

    @staticmethod
    def _sentences(text):
        return [s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-Z])', text) if s.strip()]

    def _prepare_review_turn(self, snap, version):
        """Prioritize short result headlines, then durable observed analysis.
        Exact final counters come last; they must not crowd out useful review."""
        candidates=[]
        outcomes=[]
        if self.story.series.enabled:
            for score in ((1,0),(0,1)):
                lines=self._sentences(self.story.series.postgame(score))
                # The series result/score headline is the one that changes for
                # the winner. Prepare BOTH outcomes ahead of speculative detail.
                headline=next((s for s in lines if 'win the series' in s or
                               'now lead the series' in s or 'series is now level' in s), None)
                if headline:candidates.append(('caster_one',headline))
                outcomes.extend(('caster_one',s) for s in lines if s not in self.result_openers and s!=headline)
        if snap['remaining']<=180 or snap['overtime']:
            cards=self.story.review_milestones(snap)
            # Freeze at most one useful milestone per player/stat. Increasing
            # counters no longer make us regenerate the same point all game.
            for card in cards:
                key=(card['name'],card['team'],card['stat'])
                existing=next((c for c in self.review_milestones.values()
                               if (c['name'],c['team'],c['stat'])==key),None)
                if existing:card=existing
                self.review_milestones[card['text']]=card
                candidates.append(('caster_two',card['text']))
        candidates.extend(outcomes)
        for score in (snap['score'],(snap['score'][0]+1,snap['score'][1]),(snap['score'][0],snap['score'][1]+1)):
            if score[0]!=score[1]:candidates.append(('caster_one',f'The final score is {max(score)} to {min(score)}.'))
        for speaker,sentence in candidates:
            key=(speaker,sentence)
            if key in self.preview_keys:continue
            try:
                self._make_line(speaker,sentence,'review_preview',version,None)
                self.preview_keys.add(key)
                self.log(f'Hybrid commentary desk prepared during play ({speaker}): {sentence}')
            except Exception as exc:
                self.log(f'Hybrid commentary warning: review preparation failed ({exc})')
            return True
        return False

    def _queue_prepared_result(self, snap, version):
        """Runs at the final packet, independently of the busy TTS producer.
        Never asks for new speech here. Use only prepared, validated sentences."""
        winner=0 if snap['score'][0]>snap['score'][1] else 1
        opening=self._opening_text(winner)
        cached=self.result_openers.get(opening)
        if cached:self.postgame_lines.append(('postgame',cached[1],cached[2],cached[3],version,None))
        used={opening}
        def add(speaker,text):
            pcm=self.prepared_review.get((speaker,text))
            if pcm is None or text in used:return False
            self.postgame_lines.append(('postgame',speaker,text,pcm,version,None))
            used.add(text);return True
        series_lines=self._sentences(self.story.series.postgame(snap['score'],self.story.events))
        headlines=[s for s in series_lines if 'win the series' in s or
                   'now lead the series' in s or 'series is now level' in s]
        for text in headlines:add('caster_one',text)
        score=f"The final score is {max(snap['score'])} to {min(snap['score'])}."
        add('caster_one',score)
        subjects=set();analysis_count=0
        for card in sorted(self.review_milestones.values(),key=lambda c:c['priority'],reverse=True):
            if card['name'] in subjects or not self.story.valid_milestone(card,snap):continue
            if add('caster_two',card['text']):
                subjects.add(card['name']);analysis_count+=1
                if analysis_count==2:break
        # One final stakes sentence; all available speech is selected now, so
        # it cannot trickle into the next game's intro from a producer queue.
        for text in reversed(series_lines):
            if text not in headlines and add('caster_one',text):break
        self.postgame_prepared=True
        self.postgame_complete.set()
        if self.postgame_lines:self.postgame_ready.set()
        self.log(f'Hybrid commentary result ready immediately: {len(self.postgame_lines)} prepared lines; no final-whistle synthesis')
        self.log('Hybrid commentary full match review: '+self.story.postgame(snap)+self.story.analysis_review(snap))

    def _opening_text(self, team):
        game = f" game {self.story.series.game}" if self.story.series.enabled else ' the game'
        return f'{self.story.teams[team]} take{game}!'

    def _generate(self):
        try:
            self._prepare_player_showcase()
            self.speech = SpeechWorker(self.log, self.stopped)
            if self.intro_enabled:
                self._make_script("caster_one", self.story.intro(), "intro", 0)
            self.intro_ready.set()
            self.intro_prepared.set()
            # Cached introductions can play immediately while the resident
            # model warms up for live discussion and uncached result sentences.
            self.speech.wait_ready()
            # Prepare both outcomes during play, so the first result call never
            # waits behind an in-flight GPU analysis paragraph.
            for team in range(2):
                self._make_line('caster_one', self._opening_text(team), 'result_opening', 0, None)
            try:
                from local_fact_selector import LocalFactSelector
                self.selector = LocalFactSelector(stop_event=self.stopped)
                self.log("Hybrid commentary text ready: local Qwen; verified match facts only")
            except Exception as exc:
                self.log(f"Hybrid commentary warning: local fact selection unavailable ({exc}); using verified facts directly")
            while not self.stopped.wait(0.2):
                with self.story_lock:
                    snap = self.final_snapshot or self.snapshot
                    version = self.generation
                    if snap and snap['ended'] and not self.postgame_prepared:
                        self._queue_prepared_result(snap,version)
                if snap and snap['ended']:
                    continue
                # Prepare through play, while still making live analysis turns.
                # No lengthy live paragraph may start in the final 90 seconds.
                # This leaves several producer turns for 30-45-second requests.
                if snap and not snap['overtime'] and not snap['ended']:
                    closing=snap['remaining']<=120 and (snap['remaining']<=90 or self.ready_line or self.clock()-self.last_analysis<35)
                    early=snap['remaining']<=240 and self.clock()-self.last_review_prepare>=45
                    if closing or early:
                        self.last_review_prepare=self.clock()
                        if self._prepare_review_turn(snap,version) or snap['remaining']<=90:continue
                if snap and not snap['ended'] and self.ready_line:
                    self._prepare_review_turn(snap,version)
                    continue
                with self.story_lock:
                    if (not snap or not snap["active"] or snap["kickoff"] or self.ready_line or
                            self.clock() - self.last_analysis < .5):
                        continue
                    version = self.generation
                    cards = self._discussion_candidates(snap, self.clock())
                    self.last_analysis = self.clock()
                if not cards:
                    continue
                ids = []
                if self.selector:
                    try:
                        # Select from short grounded previews; speaking the
                        # full paragraph doesn't require rereading it in the LLM.
                        previews = [f'{card.key}: ' + ' '.join(card.text.split()[:24]) for card in cards]
                        ids = self.selector.choose(previews)
                    except Exception as exc:
                        self.log(f"Hybrid commentary warning: fact selection fell back ({exc})")
                ids = [i for i in ids if 0 <= i < len(cards)]
                if not ids:
                    ids = [0]
                card = cards[ids[0]]
                try:
                    self._make_line(self.next_speaker, card.text, 'analysis', version,
                                    card.expires, card=card)
                except Exception as exc:
                    self.log(f'Hybrid commentary warning: this analysis failed ({exc}); retrying the next turn')
                    if self.speech.process.poll() is not None:
                        raise RuntimeError('Chatterbox stopped; result commentary is unavailable') from exc
        except Exception as exc:
            if not self.stopped.is_set():
                self.log(f"Hybrid commentary warning: background speech unavailable ({exc}); recordings remain active")
            self.intro_ready.set()
            self.postgame_ready.set()
        finally:
            self.presentation_prepared.set()
            self.intro_prepared.set()
            self.postgame_complete.set()
            if self.selector:
                self.selector.close()
            if self.speech:
                self.speech.close()

    def _discussion_candidates(self, snapshot, now):
        cards = discussion_lines(self.story, snapshot, now, self.discussion_number)
        fresh = [c for c in cards if c.key not in self.topic_history and c.text not in self.history]
        if not fresh:
            fresh = [c for c in cards if c.key not in self.topic_history] or cards
        others = [c for c in fresh if not c.subject or not self.subject_history or
                  c.subject != self.subject_history[-1]]
        if others:
            fresh = others
        # Rank observed player narratives above general chatter. A bounded
        # shortlist keeps the local text model prompt small and responsive.
        return sorted(fresh, key=lambda c: c.priority, reverse=True)[:4]

    def _make_line(self, speaker, text, category, version, expires, facts_used=(), card=None):
        style = speech_style(speaker, card.energy if card else
                             'hype' if speaker == 'caster_one' and category in ('postgame', 'result_opening', 'review_preview') else 'lively')
        key=(speaker,text)
        if category=='postgame' and key in self.prepared_review:
            pcm=self.prepared_review[key]
            with self.story_lock:
                if version==self.generation and not self.stopped.is_set():
                    self.postgame_lines.append((category,speaker,text,pcm,version,expires,tuple(facts_used),card));self.postgame_ready.set()
            return
        digest = hashlib.sha256(f"chatterbox-v2:{speaker}:{style}:{text}".encode()).hexdigest()[:24]
        output = ROOT / "cache" / "hybrid_generated" / f"{digest}.wav"
        output = self.speech.synthesize(speaker, text, output,
                                       # Intro generation and outcome preparation can
                                       # overlap kickoff because launch is asynchronous.
                                       style={**style, 'gameplay_budget': category != 'postgame'})
        pcm = self.bank._load(output, self.player.sample_rate)
        with self.story_lock:
            if category == 'result_opening':
                self.result_openers[text] = (category, speaker, text, pcm, version, None)
                return
            if category == 'review_preview':
                if self.final_snapshot:return  # result queue is already sealed
                self.prepared_review[key]=pcm
                return  # Cache only. Final script selects exact valid sentences.
            if category == 'intro' and self.intro_done:
                return
            valid = (card.valid(self.snapshot, self.clock(), self.story.epoch)
                     if card and self.snapshot else version == self.generation)
            if self.stopped.is_set() or not valid:
                self.log("Hybrid commentary DROP: match changed while generating analysis")
                return
            line = (category, speaker, text, pcm, version, expires, tuple(facts_used), card)
            if category == 'intro':
                self.intro_lines.append(line)
                self.intro_ready.set()
            elif category == 'postgame':
                self.postgame_lines.append(line)
                self.postgame_ready.set()
            else:
                self.ready_line = line

    def _play_ready(self, now, intro_only=False, script=None):
        with self.story_lock:
            queue = (self.intro_lines if script == 'intro' else
                     self.postgame_lines if script == 'postgame' else None)
            line = self.ready_line if queue is None else queue[0] if queue else None
            if not line:
                return
            category, speaker, text, pcm, version, expires = line[:6]
            facts_used = line[6] if len(line) > 6 else ()
            card = line[7] if len(line) > 7 else None
            valid = (card.valid(self.snapshot, now, self.story.epoch) if card and self.snapshot
                     else version == self.generation)
            if not valid or (expires is not None and now > expires):
                if queue is not None:
                    queue.popleft()
                else:
                    self.ready_line = None
                return
            if facts_used and self.snapshot:
                current_facts = self.story.facts(self.snapshot)
                if any(fact not in current_facts for fact in facts_used):
                    self.ready_line = None
                    return
            if intro_only and category != "intro":
                return
            if category == "intro" and self.intro_done:
                if queue is not None:
                    queue.clear()
                else:
                    self.ready_line = None
                return
            if self.player.busy or self.pending or self.goal_calls or (self.goal_player and self.goal_player.busy):
                return
            if self.countdown_player and self.countdown_player.busy:
                return
            if category == 'analysis' and self.remaining_time is not None and not self.overtime:
                # Keep new analysis out of the countdown's approach. Already
                # playing speech still finishes; the countdown has its own lane.
                if 0 <= self.remaining_time <= 10 + len(pcm) / self.player.sample_rate:
                    return
            if category == 'analysis' and now < self.next_ambient:
                return
            if self.player.play(pcm, interruptible=category == 'analysis') is False:
                return
            if queue is not None:
                queue.popleft()
            else:
                self.ready_line = None
            self.current = (category, None, None)
            self.was_busy = True
            self.history.append(text)
            if card:
                self.topic_history.append(card.key)
                if card.subject:
                    self.subject_history.append(card.subject)
                self.discussion_number += 1
            if self.snapshot:
                for fact in self.story.facts(self.snapshot):
                    if fact in text:
                        self.history.append(fact)
            self.next_speaker = "caster_one" if speaker == "caster_two" else "caster_two"
            if category == "intro" and queue is None:
                self.intro_done = True
            self.log(f"Hybrid commentary PLAY ({speaker}): {text}")

    def process_packet(self, packet):
        if self.final_snapshot is not None:
            return  # Keep the result desk tied to this game's immutable final facts.
        now = self.clock()
        with self.story_lock:
            previous = self.snapshot
            version = self.story.score_version
            epoch = self.story.epoch
            snap = self.story.update(packet, now)
            if snap:
                self.snapshot = snap
                if epoch != self.story.epoch:
                    self.topic_history.clear()
                    self.subject_history.clear()
                    self.history.clear()
                if (self.story.score_version != version or
                        (previous and clock_phase(previous) != clock_phase(snap))):
                    self.generation += 1
                    card = self.ready_line[7] if self.ready_line and len(self.ready_line) > 7 else None
                    if not card or not card.valid(snap, now, self.story.epoch):
                        self.ready_line = None
                if previous and previous["active"] and not snap["active"]:
                    self.ready_line = None
                if snap['ended'] and snap['score'][0] != snap['score'][1] and self.final_snapshot is None:
                    self.final_snapshot = snap
                    self.ready_line = None
                    self._queue_prepared_result(snap,self.generation)
        super().process_packet(packet)
        if snap:
            for event in snap['critical_demos']:
                self._event('critical_demo', event['player'], event['team'])
            self._service_pending(now)
        # React first; the next discussion has already been prepared on air.
        if snap and snap["active"] and not snap["kickoff"]:
            self.intro_done = True
            with self.story_lock:
                self.intro_lines.clear()
            self._play_ready(now)

    def stop(self):
        self.stopped.set()
        loading_thread = getattr(self, 'loading_thread', None)
        if loading_thread:
            loading_thread.join(timeout=1)
        # Stop only our own generator, never other training/model processes.
        if self.speech:
            self.speech.close()
        if self.generation_thread.ident is not None:
            self.generation_thread.join(timeout=4)
        super().stop()

    def finish_match(self, timeout=35):
        """Play the prepared desk; don't block the next game on fresh TTS."""
        if not self.generation_thread.is_alive() and not self.postgame_lines:
            self.log('Hybrid commentary warning: postgame speech engine is not running')
            return
        self.log('Hybrid commentary: playing the prepared game and series result...')
        with self.story_lock:
            self.ready_line = None
        completed = self._play_script('postgame', self.postgame_complete, timeout)
        if not completed:
            self.log('Hybrid commentary: result desk playback budget reached; the sentence on air finished before continuing')
        elif not self.postgame_ready.is_set():
            self.log('Hybrid commentary: no prepared result audio was available; continuing without a generation wait')
