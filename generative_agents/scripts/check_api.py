"""
Checks the model settings with one generation and one embedding before a long
run: key, address, model names, embedding size and the Chinese instruction.

  python scripts/check_api.py

Uses the same environment variables as the simulation (see llm.py).
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "reverie", "backend_server"))
import llm  # noqa: E402

model = llm.get_llm()
print(f"API: {model.api}  address: {model.base_url or 'OpenAI'}  model: {model.model}")
try:
  t = time.monotonic()
  with llm.task("generate_iterative_chat_utt"):
    text = model.complete("Two neighbors meet at a cafe in the morning. Write one short "
                          "friendly greeting that one of them says.", completion_style=False)
  print(f"generation OK ({time.monotonic() - t:.1f}s): {text.strip()[:120]}")
  t = time.monotonic()
  vec = model.embed("陳建國 is opening Harvey Oak Supply Store")
  print(f"embedding OK ({time.monotonic() - t:.1f}s): {len(vec)} dimensions with {model.embed_model}")
except llm.FatalLLMError as exc:
  print(f"FAILED (settings): {exc}")
  sys.exit(1)
except Exception as exc:  # noqa: BLE001
  print(f"FAILED: {type(exc).__name__}: {exc}")
  sys.exit(1)
u = model.usage
print(f"tokens: in {u.input_tokens}, out {u.output_tokens} (thinking {u.reasoning_tokens}); "
      f"cost by configured prices ${u.cost_usd:.6f}")
