"""
Embedding storage for one persona's associative memory.

The original kept every embedding as a Python list in a dict and rewrote all
of them as JSON on each save. Over 100 simulated days that grows to tens of
thousands of vectors per persona (gigabytes across 16 personas) and makes
every retrieval loop over Python lists.

EmbeddingStore keeps the same dict-like interface (`key in store`,
`store[key]`, `store[key] = vector`) but holds the vectors in one float32
NumPy matrix, saves them as embeddings.npy + embedding_keys.json, and can
score many rows against a query in one matrix product. Old embeddings.json
files still load.
"""
from __future__ import annotations

import json
import os

import numpy as np


class EmbeddingStore:
  def __init__(self, dim: int | None = None):
    self._index: dict[str, int] = {}
    self._keys: list[str] = []
    self._dim = dim
    self._mat = np.zeros((0, dim or 0), dtype=np.float32)
    self._norm = np.zeros(0, dtype=np.float32)
    self._n = 0

  # ---------------------------------------------------------------- dict API
  def __contains__(self, key) -> bool:
    return key in self._index

  def __getitem__(self, key) -> np.ndarray:
    return self._mat[self._index[key]].copy()

  def __setitem__(self, key, vector) -> None:
    vec = np.asarray(vector, dtype=np.float32).reshape(-1)
    if self._dim is None:
      self._dim = vec.shape[0]
      self._mat = np.zeros((0, self._dim), dtype=np.float32)
    if vec.shape[0] != self._dim:
      raise ValueError(
        f"embedding for {key!r} has {vec.shape[0]} dimensions but this memory uses "
        f"{self._dim}; a base simulation must be embedded with the same model/dimensions "
        f"(GA_EMBED_MODEL / GA_EMBED_DIMENSIONS)")
    row = self._index.get(key)
    if row is None:
      row = self._n
      if row >= self._mat.shape[0]:
        grow = max(256, self._mat.shape[0])
        self._mat = np.vstack([self._mat, np.zeros((grow, self._dim), dtype=np.float32)])
        self._norm = np.concatenate([self._norm, np.zeros(grow, dtype=np.float32)])
      self._index[key] = row
      self._keys.append(key)
      self._n += 1
    self._mat[row] = vec
    self._norm[row] = np.linalg.norm(vec)

  def __len__(self) -> int:
    return self._n

  def keys(self):
    return list(self._keys)

  def items(self):
    return ((k, self[k]) for k in self._keys)

  @property
  def dim(self):
    return self._dim

  # ---------------------------------------------------------------- scoring
  def cosine(self, keys, query) -> np.ndarray:
    """Cosine similarity of each key's vector with `query` (same formula as
    retrieve.cos_sim: dot(a, b) / (norm(a) * norm(b)))."""
    q = np.asarray(query, dtype=np.float32).reshape(-1)
    rows = np.fromiter((self._index[k] for k in keys), dtype=np.int64, count=len(keys))
    if rows.size == 0:
      return np.zeros(0, dtype=np.float32)
    dots = self._mat[rows] @ q
    with np.errstate(divide="ignore", invalid="ignore"):
      return dots / (self._norm[rows] * np.linalg.norm(q))

  # ---------------------------------------------------------------- disk
  def save(self, folder: str) -> None:
    np.save(os.path.join(folder, "embeddings.npy"), self._mat[: self._n])
    with open(os.path.join(folder, "embedding_keys.json"), "w", encoding="utf-8") as fh:
      json.dump(self._keys, fh, ensure_ascii=False)

  @classmethod
  def load(cls, folder: str) -> "EmbeddingStore":
    npy = os.path.join(folder, "embeddings.npy")
    keys_path = os.path.join(folder, "embedding_keys.json")
    store = cls()
    if os.path.exists(npy) and os.path.exists(keys_path):
      mat = np.load(npy).astype(np.float32, copy=False)
      with open(keys_path, encoding="utf-8") as fh:
        keys = json.load(fh)
      store._dim = mat.shape[1] if mat.ndim == 2 and mat.shape[0] else None
      store._mat = mat.copy() if mat.size else np.zeros((0, 0), dtype=np.float32)
      store._norm = np.linalg.norm(store._mat, axis=1).astype(np.float32) if mat.size else np.zeros(0, np.float32)
      store._keys = list(keys)
      store._index = {k: i for i, k in enumerate(keys)}
      store._n = len(keys)
      return store
    legacy = os.path.join(folder, "embeddings.json")
    if os.path.exists(legacy):
      with open(legacy, encoding="utf-8") as fh:
        for key, vec in json.load(fh).items():
          store[key] = vec
    return store
