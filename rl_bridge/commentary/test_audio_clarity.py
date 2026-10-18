import asyncio
import edge_tts
from pathlib import Path
import soundfile as sf
import numpy as np

async def generate_edge():
    out_edge_caster_one = Path(__file__).parent / "test_edge_caster_one.mp3"
    out_edge_caster_two = Path(__file__).parent / "test_edge_caster_two.mp3"
    
    # Ryan is deep British, Thomas is energetic British
    # Caster One: energetic, expressive British caster
    # Caster Two: high energy banter British caster
    comm_caster_one = edge_tts.Communicate(
        "Green light, engines revving, here we go for kickoff! Welcome everyone to Champions Field!",
        voice="en-GB-RyanNeural",
        rate="+15%",
        pitch="+0Hz"
    )
    await comm_caster_one.save(str(out_edge_caster_one))
    
    comm_caster_two = edge_tts.Communicate(
        "Both teams looking sharp in warmups! Setting the pace early is going to be massive!",
        voice="en-GB-ThomasNeural",
        rate="+15%",
        pitch="+5Hz"
    )
    await comm_caster_two.save(str(out_edge_caster_two))
    print("Edge-TTS generated test files successfully!")

if __name__ == "__main__":
    asyncio.run(generate_edge())
