"""
Settings shared by the backend.

The original project asked every user to hand-write this file with their
OpenAI key inside. It is now committed and reads everything from environment
variables; the API key stays in the environment (or Google Secret Manager on
the cloud VM) and is read by llm.py, never written to disk.

  GA_STORAGE        where simulations are stored
                    (default: environment/frontend_server/storage)
  GA_TEMP_STORAGE   scratch files shared with the frontend
  GA_ASSETS         map assets (default: environment/frontend_server/static_dirs/assets)
  GA_DEBUG          "1" prints the original verbose prompt traces
"""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_FRONTEND = os.path.normpath(os.path.join(_HERE, "..", "..", "environment", "frontend_server"))

openai_api_key = os.environ.get("OPENAI_API_KEY", "")
key_owner = os.environ.get("GA_KEY_OWNER", "")

maze_assets_loc = os.environ.get("GA_ASSETS", os.path.join(_FRONTEND, "static_dirs", "assets"))
env_matrix = f"{maze_assets_loc}/the_ville/matrix"
env_visuals = f"{maze_assets_loc}/the_ville/visuals"

fs_storage = os.environ.get("GA_STORAGE", os.path.join(_FRONTEND, "storage"))
fs_temp_storage = os.environ.get("GA_TEMP_STORAGE", os.path.join(_FRONTEND, "temp_storage"))

collision_block_id = "32125"

# Verbose mode
debug = os.environ.get("GA_DEBUG", "0") == "1"
