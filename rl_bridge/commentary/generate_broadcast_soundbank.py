"""
Complete Broadcast Soundbank Synthesizer for Caster One & Caster Two.
Pre-synthesizes a massive, rich repertoire of 50+ unique studio-quality AI lines
on the NVIDIA RTX 5060 GPU so real-time commentary can talk NON-STOP throughout
the entire 5-minute match with ZERO DELAY and ZERO REPETITION.
"""

import time
import os
from pathlib import Path
import soundfile as sf
import numpy as np
import torch
from chatterbox.tts import ChatterboxTTS, Conditionals

CACHE_DIR = Path(__file__).parent / "cache"
SHOUTS_DIR = CACHE_DIR / "reflex_shouts"
SHOUTS_DIR.mkdir(parents=True, exist_ok=True)

BROADCAST_LINES = [
    # --- INTROS & KICKOFFS ---
    ("caster_one_intro_0", "caster_one", "Green light, engines revving, here we go for kickoff!"),
    ("caster_one_intro_1", "caster_one", "Welcome everyone to Champions Field, Caster One and Caster Two with you on the desk!"),
    ("caster_two_intro_0", "caster_two", "Both teams looking sharp in warmups. Setting the pace early is going to be massive."),
    ("caster_two_intro_1", "caster_two", "Opening kickoff underway, first 50-50 contested in the center circle!"),

    # --- MIDFIELD PACING & YAPPING (CASTER_ONE) ---
    ("caster_one_yap_0", "caster_one", "Possession trading back and forth across the midfield line right now."),
    ("caster_one_yap_1", "caster_one", "High tempo from both sides. Nobody willing to give an inch of space."),
    ("caster_one_yap_2", "caster_one", "They recycle possession back to the third man, looking to rebuild the attack."),
    ("caster_one_yap_3", "caster_one", "The transition speed in this match is unbelievable, defense to attack in a flash."),
    ("caster_one_yap_4", "caster_one", "A little hesitation on the clear, but they manage to scramble it away safely."),
    ("caster_one_yap_5", "caster_one", "Smart rotation out of the corner, keeping the defense honest."),
    ("caster_one_yap_6", "caster_one", "The ball pinballs around the center circle, waiting for someone to take control."),

    # --- MIDFIELD TACTICAL BANTER & YAPPING (CASTER_TWO) ---
    ("caster_two_yap_0", "caster_two", "You know Emile, the boost control right now is completely dictating the flow."),
    ("caster_two_yap_1", "caster_two", "Look at the positioning on the back post. That defensive structure is rock solid."),
    ("caster_two_yap_2", "caster_two", "If you get caught with zero boost against this offense, you are in serious trouble."),
    ("caster_two_yap_3", "caster_two", "They are hoovering up all the midfield pads. Absolute textbook rotation."),
    ("caster_two_yap_4", "caster_two", "I love the composure here. No panic touches, just calm controlled play."),
    ("caster_two_yap_5", "caster_two", "Notice how high they are pushing their challenges. Refusing to allow any air dribbles."),
    ("caster_two_yap_6", "caster_two", "Both teams feeling each other out right now, waiting for the first defensive slip."),
    ("caster_two_yap_7", "caster_two", "The recovery mechanics on display are top tier. Resetting so quickly off the backboard."),

    # --- PASSES & INFIELD PLAYS ---
    ("caster_one_pass_0", "caster_one", "Lovely vision, picking out the teammate with an infield delivery!"),
    ("caster_one_pass_1", "caster_one", "Drops it back, looking for the one-two combination!"),
    ("caster_one_pass_2", "caster_one", "Cross comes in from the sidewall, dangerous ball into the box!"),
    ("caster_two_pass_0", "caster_two", "Tremendous awareness to find the pass rather than taking a low percentage shot."),
    ("caster_two_pass_1", "caster_two", "That pass completely opened up the pitch. Superb field awareness."),

    # --- AERIALS & WALL PLAYS ---
    ("caster_one_aerial_0", "caster_one", "Launches up into the air, reaching that before anyone else!"),
    ("caster_one_aerial_1", "caster_one", "High aerial contest! Wins the touch way up near the ceiling!"),
    ("caster_one_aerial_2", "caster_one", "Off the backboard, reading the awkward rebound with composure!"),
    ("caster_two_aerial_0", "caster_two", "Look at the recovery speed off the wall. Lightning fast mechanics."),
    ("caster_two_aerial_1", "caster_two", "Challenging way up high to snuff out the shot early. Brilliant anticipation."),

    # --- BUMPS & 50-50s ---
    ("caster_one_bump_0", "caster_one", "Big physical contact in the midfield, knocking them clean off the line!"),
    ("caster_one_bump_1", "caster_one", "Heavy bump on the rotation! That creates so much space for the attack!"),
    ("caster_two_bump_0", "caster_two", "Aggressive disruption! You have to respect the physical presence out there."),
    ("caster_two_bump_1", "caster_two", "Completely displaced on defense, that bump created chaos in the net."),

    # --- GOAL REACTIONS (ADDITIONAL DIVERSITY) ---
    ("caster_one_goal_3", "caster_one", "An absolute rocket! Unstoppable strike past the keeper!"),
    ("caster_one_goal_4", "caster_one", "Off the crossbar and in! You cannot defend that!"),
    ("caster_one_goal_5", "caster_one", "What a hit! He finds the breakthrough with style!"),
    ("caster_two_goal_3", "caster_two", "Sensational technique, catching the defense completely off guard!"),
    ("caster_two_goal_4", "caster_two", "Textbook execution, punishing the smallest defensive mistake!"),
    ("caster_two_goal_5", "caster_two", "Ice in the veins! That is how you finish a chance!"),

    # --- EPIC SAVES (ADDITIONAL DIVERSITY) ---
    ("caster_one_save_2", "caster_one", "How has he kept that out?! A heroic stop from nowhere!"),
    ("caster_one_save_3", "caster_one", "Full stretch on the line! Incredible goalkeeping!"),
    ("caster_two_save_2", "caster_two", "He robs them right on the doorstep! That was a certain goal!"),
    ("caster_two_save_3", "caster_two", "Masterclass in defensive positioning. Closes the door shut!"),

    # --- CLOCK PRESSURE & FINAL MINUTES ---
    ("caster_one_clock_60", "caster_one", "One minute remaining on the clock! Tension is through the roof!"),
    ("caster_one_clock_30", "caster_one", "Thirty seconds left! It is all or nothing right now!"),
    ("caster_two_clock_crunch", "caster_two", "Crunch time in this match. Every single touch could decide the series."),
    ("caster_two_clock_desperate", "caster_two", "Clock winding down rapidly. Desperation time for the defense."),

    # --- MIDFIELD PACING EXPANSION (CASTER_ONE) ---
    ("caster_one_yap_7", "caster_one", "Back and forth in the neutral third, waiting for an opening."),
    ("caster_one_yap_8", "caster_one", "They look to reset, collecting the corner boost and swinging wide."),
    ("caster_one_yap_9", "caster_one", "High pressing defense right now, trapping them inside their own defensive third."),
    ("caster_one_yap_10", "caster_one", "Clean aerial touch to relieve the pressure and restart the attack."),
    ("caster_one_yap_11", "caster_one", "Look at the tempo here, both squads playing at maximum velocity."),
    ("caster_one_yap_12", "caster_one", "A delicate touch off the nose of the car to retain offensive control."),
    ("caster_one_yap_13", "caster_one", "Midfield scramble, both third men holding back to prevent the counter."),
    ("caster_one_yap_14", "caster_one", "They swing it out to the wing, probing for any gap in the rotation."),

    # --- TACTICAL BANTER EXPANSION (CASTER_TWO) ---
    ("caster_two_yap_8", "caster_two", "The mechanical consistency at this level is just outrageous, Emile."),
    ("caster_two_yap_9", "caster_two", "Notice how nobody is committing as the first man without boost in the tank."),
    ("caster_two_yap_10", "caster_two", "You have to love the patience on display. No frantic clears, just measured touches."),
    ("caster_two_yap_11", "caster_two", "They are forcing so many fifty-fifties to disrupt the offensive rhythm."),
    ("caster_two_yap_12", "caster_two", "If you overcommit on offense against this defense, you will get punished in seconds."),
    ("caster_two_yap_13", "caster_two", "Superb defensive spacing. Even when one player whiffs, the backup is right there."),
    ("caster_two_yap_14", "caster_two", "The physical presence in the midfield is starting to wear them down."),
    ("caster_two_yap_15", "caster_two", "Both teams respecting each other's firepower right now, waiting for the first mistake."),

    # --- PASSES & INFIELD DELIVERIES EXPANSION ---
    ("caster_one_pass_3", "caster_one", "Infield feed, looking to unlock the defense with pace!"),
    ("caster_one_pass_4", "caster_one", "Clever touch back to the trailing man on the rotation!"),
    ("caster_one_pass_5", "caster_one", "Whips the ball across the face of goal!"),
    ("caster_two_pass_2", "caster_two", "That vision to find the trailing runner is world class."),
    ("caster_two_pass_3", "caster_two", "Textbook counter-attacking delivery. Caught them completely flat-footed."),
    ("caster_two_pass_4", "caster_two", "Selfless team play. Passing up the low angle shot to feed the teammate."),

    # --- AERIALS & WALL CONTESTS EXPANSION ---
    ("caster_one_aerial_3", "caster_one", "Skying high into the rafters, getting there before anyone else!"),
    ("caster_one_aerial_4", "caster_one", "Reads the sidewall bounce with absolute perfection!"),
    ("caster_one_aerial_5", "caster_one", "Ceiling read! Touch off the roof of the arena!"),
    ("caster_two_aerial_2", "caster_two", "The aerial car control on display is just poetry in motion."),
    ("caster_two_aerial_3", "caster_two", "Challenging early in the air to take away all shooting angles."),
    ("caster_two_aerial_4", "caster_two", "Incredible aerial recovery, landing wheels down cleanly on the backboard."),

    # --- GOAL REACTIONS EXPANSION ---
    ("caster_one_goal_6", "caster_one", "Downtown rocket! Finds the postage stamp in the top corner!"),
    ("caster_one_goal_7", "caster_one", "A piece of pure genius! How did he sneak that into the net?!"),
    ("caster_two_goal_6", "caster_two", "That is an unstoppable piece of finishing. Zero chance for the keeper."),
    ("caster_two_goal_7", "caster_two", "Cold-blooded finish. Stared down the defense and buried it home."),

    # --- SAVES EXPANSION ---
    ("caster_one_save_4", "caster_one", "Cat-like reflexes on the goal line! Keeps it out with authority!"),
    ("caster_one_save_5", "caster_one", "A desperate goal line dive, and he saves the day!"),
    ("caster_two_save_4", "caster_two", "He had no right to make that stop. Absolute robbery in the net!"),
    ("caster_two_save_5", "caster_two", "Stone wall defense. Puts his body on the line to deny a certain goal."),

    # --- CLOCK & SERIES PRESSURE EXPANSION ---
    ("caster_one_clock_120", "caster_one", "Under two minutes remaining, tension building with every single possession!"),
    ("caster_one_clock_10", "caster_one", "Ten seconds left! Final attack of regulation!"),
    ("caster_two_clock_urgency", "caster_two", "Every second ticking away is pure agony for the trailing team."),
    ("caster_two_clock_risk", "caster_two", "Do-or-die time right now. You have to risk everything on every challenge."),
]

def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[SoundbankGen] Initializing ChatterboxTTS on {device} (RTX 5060)...")
    model = ChatterboxTTS.from_pretrained(device=device)

    caster_one_conds = Conditionals.load(CACHE_DIR / "caster_one_conds.pt", map_location=device)
    caster_two_conds = Conditionals.load(CACHE_DIR / "caster_two_conds.pt", map_location=device)

    total = len(BROADCAST_LINES)
    print(f"[SoundbankGen] Generating {total} broadcast commentary lines...")

    for i, (key, speaker, text) in enumerate(BROADCAST_LINES):
        out_wav = SHOUTS_DIR / f"{key}.wav"
        if out_wav.exists() and out_wav.stat().st_size > 50000:
            print(f"[{i+1}/{total}] Skipping already generated: {out_wav.name}")
            continue

        print(f"[{i+1}/{total}] Synthesizing [{speaker.upper()}] \"{text}\" -> {out_wav.name}...")
        t0 = time.time()
        model.conds = caster_one_conds if speaker == "caster_one" else caster_two_conds

        with torch.inference_mode():
            wav = model.generate(text, exaggeration=0.65)

        if not isinstance(wav, torch.Tensor):
            wav = torch.tensor(wav)
        wav_np = wav.cpu().numpy()
        if wav_np.ndim > 1:
            wav_np = wav_np.squeeze()

        peak = np.max(np.abs(wav_np))
        if peak > 0:
            wav_np = (wav_np / peak * 0.95).astype(np.float32)

        sf.write(str(out_wav), wav_np, model.sr, subtype="PCM_16")
        dur = len(wav_np) / model.sr
        print(f"  -> Saved {out_wav.name} ({dur:.1f}s) in {time.time()-t0:.2f}s")

    print("[SoundbankGen] Full broadcast soundbank successfully generated!")

if __name__ == "__main__":
    main()
