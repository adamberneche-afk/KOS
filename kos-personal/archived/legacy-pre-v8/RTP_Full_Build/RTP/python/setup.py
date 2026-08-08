"""
RTP Setup Script — v2.0
Run this locally to generate your canonical documentation scaffold.
Usage: python setup.py
"""

import subprocess
import json
import sys
import os

def run_setup():
    config_file = "config.json"

    if not os.path.exists(config_file):
        print(f"❌ Error: {config_file} not found. Make sure it's in the same directory.")
        sys.exit(1)

    with open(config_file, "r") as f:
        config = json.load(f)

    assistant = config.get("ai_coding_assistant", {})
    setup_script = assistant.get("setup_script", "create_documents.py")

    print(f"\n🧠 Recursive Thought Partner — Environment Setup")
    print(f"{'='*50}")
    print(f"  Assistant Name : {assistant.get('name', 'RTP')}")
    print(f"  Role           : {assistant.get('role', 'AI Coding Assistant')}")
    print(f"  Setup Script   : {setup_script}")
    print(f"{'='*50}\n")

    if os.path.exists(setup_script):
        print(f"▶  Executing {setup_script}...")
        result = subprocess.run([sys.executable, setup_script], capture_output=False)
        if result.returncode != 0:
            print(f"❌ {setup_script} exited with code {result.returncode}")
            sys.exit(result.returncode)
    else:
        print(f"❌ Setup script '{setup_script}' not found.")
        sys.exit(1)

    print(f"\n{'='*50}")
    print("✅ Environment setup complete.")
    print("\nNEXT STEPS:")
    print("  1. Open CLAUDE.md and fill in your project-specific rules")
    print("  2. Open progress.txt and set your initial state")
    print("  3. Point your AI agent (Cursor/Claude) to CLAUDE.md as primary context")
    print("  4. Follow DEPLOYMENT_GUIDE.md for Google Apps Script setup")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    run_setup()
