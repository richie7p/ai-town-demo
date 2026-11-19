import os
import sys

BACKEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend_server")
sys.path.insert(0, BACKEND)
# The original code opens prompt templates with paths relative to backend_server.
os.chdir(BACKEND)
