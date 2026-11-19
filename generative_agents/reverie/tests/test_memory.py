"""Embedding store and vectorised retrieval behave like the original."""
import json
import os
import random
import shutil

import numpy as np
import pytest

from persona.memory_structures.embedding_store import EmbeddingStore
from persona.memory_structures.associative_memory import AssociativeMemory
from persona.cognitive_modules import retrieve as R

BASE = os.path.join(os.path.dirname(os.path.abspath(R.__file__)), "..", "..", "..", "..",
                    "environment", "frontend_server", "storage", "base_the_ville_n25", "personas")


def test_store_behaves_like_a_dict_and_round_trips(tmp_path):
  store = EmbeddingStore()
  store["a"] = [1.0, 0.0, 0.0]
  store["b"] = [0.0, 2.0, 0.0]
  store["a"] = [3.0, 0.0, 0.0]               # overwrite keeps one row
  assert "a" in store and "z" not in store and len(store) == 2
  assert list(store["a"]) == [3.0, 0.0, 0.0]
  for i in range(600):                       # forces the matrix to grow
    store[f"k{i}"] = [1.0, float(i), 0.0]
  store.save(str(tmp_path))
  again = EmbeddingStore.load(str(tmp_path))
  assert again.keys() == store.keys()
  assert np.allclose(again["k599"], [1.0, 599.0, 0.0])
  with pytest.raises(ValueError, match="dimensions"):
    again["bad"] = [1.0, 2.0]


def test_vectorised_cosine_matches_original_cos_sim():
  rng = np.random.default_rng(0)
  store = EmbeddingStore()
  vecs = {f"n{i}": rng.normal(size=16) for i in range(50)}
  for k, v in vecs.items():
    store[k] = v
  q = rng.normal(size=16)
  fast = store.cosine(list(vecs), q)
  slow = [R.cos_sim(v.astype(np.float32), q.astype(np.float32)) for v in vecs.values()]
  assert np.allclose(fast, slow, atol=1e-6)


def _memory_with_events(folder, n=40, dim=24, seed=1):
  """An AssociativeMemory filled through the original add_event API."""
  import datetime
  os.makedirs(folder, exist_ok=True)
  for name, data in (("nodes.json", {}), ("embeddings.json", {}),
                     ("kw_strength.json", {"kw_strength_event": {}, "kw_strength_thought": {}})):
    with open(os.path.join(folder, name), "w") as fh:
      json.dump(data, fh)
  mem = AssociativeMemory(folder)
  rng = random.Random(seed)
  t0 = datetime.datetime(2023, 2, 13, 8)
  for i in range(n):
    desc = f"event number {i} at the cafe"
    vec = [rng.uniform(-1, 1) for _ in range(dim)]
    mem.add_event(t0 + datetime.timedelta(minutes=i), None, "Isabella", "is", f"thing {i}",
                  desc, {"cafe", f"thing {i}"}, rng.randint(1, 9), (desc, vec), None)
  return mem


def test_legacy_json_memory_loads_and_saves_in_new_format(tmp_path):
  legacy_dir = tmp_path / "legacy"
  mem = _memory_with_events(str(legacy_dir))
  mem.save(str(legacy_dir))
  # Turn the save into the original JSON layout, then load it.
  vectors = {k: [float(x) for x in v] for k, v in mem.embeddings.items()}
  (legacy_dir / "embeddings.json").write_text(json.dumps(vectors))
  (legacy_dir / "embeddings.npy").unlink()
  (legacy_dir / "embedding_keys.json").unlink()
  old = AssociativeMemory(str(legacy_dir))
  assert len(old.embeddings) == 40 and len(old.id_to_node) == 40

  out = tmp_path / "new"
  out.mkdir()
  old.save(str(out))
  assert (out / "embeddings.npy").exists() and not (out / "embeddings.json").exists()
  again = AssociativeMemory(str(out))
  assert len(again.id_to_node) == 40
  key = next(iter(vectors))
  assert np.allclose(again.embeddings[key], vectors[key], atol=1e-6)


def test_new_retrieve_ranks_the_same_as_the_original_algorithm(tmp_path, monkeypatch):
  import datetime
  from types import SimpleNamespace
  mem = _memory_with_events(str(tmp_path / "am"), n=60)
  persona = SimpleNamespace(a_mem=mem, scratch=SimpleNamespace(
    curr_time=datetime.datetime(2023, 2, 13, 12), recency_decay=0.99,
    recency_w=1, relevance_w=1, importance_w=1))
  focal_vec = list(mem.embeddings[mem.seq_event[7].embedding_key])
  monkeypatch.setattr(R, "get_embedding", lambda text: focal_vec)

  nodes = [i for i in mem.seq_event + mem.seq_thought if "idle" not in i.embedding_key]
  original = {n.node_id: R.cos_sim(mem.embeddings[n.embedding_key], focal_vec) for n in nodes}
  fast = R.extract_relevance(persona, nodes, "focal")
  assert set(fast) == set(original)
  assert all(abs(fast[k] - original[k]) < 1e-5 for k in fast)

  top = R.new_retrieve(persona, ["focal"], n_count=5)["focal"]
  assert len(top) == 5
  assert mem.seq_event[7] in top          # the exact match is retrieved
  assert all(n.last_accessed == persona.scratch.curr_time for n in top)
