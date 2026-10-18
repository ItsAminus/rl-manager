import subprocess
import time
import os
import sys

def main():
    print("Testing RLBot Match Launch...")
    # Create a simple generic 3v3 config
    config_content = """[match]
game_mode = "Soccer"
game_map = "Mannfield"
match_length = "5 Minutes"

[[cars]]
team = 0
name = "Human"
type = "human"

[[cars]]
team = 1
name = "Bot"
type = "rlbot"
agent_id = "psyonix"
"""
    
    test_config_path = "test_config.toml"
    with open(test_config_path, "w") as f:
        f.write(config_content)
        
    print(f"Created config at {test_config_path}")
    
    try:
        # Assuming RLBot is available in PATH
        print("Launching RLBot...")
        process = subprocess.Popen(["rlbot", "start", "-c", test_config_path])
        print(f"RLBot spawned with PID: {process.pid}")
        
        # Keep alive for 10 seconds to verify it doesn't crash immediately
        time.sleep(10)
        
        if process.poll() is None:
            print("RLBot is running successfully. Terminating test...")
            process.terminate()
        else:
            print("RLBot exited unexpectedly.")
            sys.exit(1)
            
    except FileNotFoundError:
        print("Error: rlbot command not found. Is it installed in your PATH?")
        sys.exit(1)
    finally:
        if os.path.exists(test_config_path):
            os.remove(test_config_path)
            print("Cleaned up test config.")

if __name__ == "__main__":
    main()
