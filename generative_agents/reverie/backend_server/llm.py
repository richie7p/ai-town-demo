"""
Model access for the modified Generative Agents (GPT-6 Luna via the OpenAI
Responses API).

Every call the original code makes -- the old completion-style GPT-3 prompts,
the ChatGPT/GPT-4 JSON prompts and the embeddings -- goes through this module,
so the model, the reasoning effort and the cost accounting live in one place.

Configuration (environment variables; nothing secret is stored in the repo):
  OPENAI_API_KEY            required for real runs (GA_API_KEY takes precedence,
                            e.g. an NVIDIA NIM key)
  GA_API                    "responses" (OpenAI, default) or "chat" (Chat
                            Completions: NVIDIA NIM and other compatible APIs)
  GA_BASE_URL               API address, e.g. https://integrate.api.nvidia.com/v1
  GA_MODEL                  default "gpt-6-luna"
  GA_EMBED_MODEL            default "text-embedding-3-small"
  GA_EMBED_EXTRA_BODY       extra JSON for embeddings, e.g. NIM's
                            {"input_type": "passage", "truncate": "END"}
  GA_REASONING_HIGH         effort for cognition tasks (planning, reflection,
                            conversation); default "low" (economical)
  GA_REASONING_LOW          effort for routine tasks (scores, emoji, object
                            picking); default "none" (economical)
  GA_SEND_REASONING         "chat" mode only: "1" sends reasoning_effort
  GA_LANGUAGE               "zh-TW" (default): conversations and thoughts in
                            Traditional Chinese; "en": everything in English
  GA_REASONING_OVERRIDES    e.g. "daily_plan=high,event_poignancy=none"
  GA_SERVICE_TIER           "auto" (default), "flex" (half price, slower) ...
  GA_MAX_OUTPUT_TOKENS      cap per call including reasoning; default 4000
  GA_MAX_CONCURRENCY        simultaneous API calls; default 16
  GA_MAX_RPM                requests per minute cap (e.g. 35 for NVIDIA NIM's
                            free tier); default none
  GA_USAGE_LOG              JSONL file receiving one line per call (optional)
  GA_PRICE_INPUT / GA_PRICE_CACHED / GA_PRICE_OUTPUT / GA_PRICE_EMBED
                            USD per 1M tokens, defaults from OpenAI's model
                            page for gpt-6-luna and text-embedding-3-small
"""
from __future__ import annotations

import contextlib
import contextvars
import functools
import json
import os
import random
import threading
import time
from dataclasses import dataclass, field

# Which reasoning effort each prompt gets. Names are the run_gpt_prompt_*
# function names without the prefix. Anything not listed is "routine".
COGNITION_TASKS = {
  "daily_plan", "generate_hourly_schedule", "task_decomp",
  "new_decomp_schedule", "decide_to_talk", "decide_to_react",
  "create_conversation", "agent_chat", "generate_next_convo_line",
  "generate_iterative_chat_utt", "focal_pt", "insight_and_guidance",
  "planning_thought_on_convo", "memo_on_convo", "summarize_conversation",
  "revise_identity",
}

# Free-text outputs a person reads (dialogue, thoughts, daily status). Action
# descriptions stay in English: the original code checks English keywords
# ("sleeping", "bed", "idle") and parses fixed English formats.
LANGUAGE_TASKS = {
  "generate_iterative_chat_utt", "agent_chat_summarize_relationship",
  "agent_chat_summarize_ideas", "planning_thought_on_convo", "memo_on_convo",
  "insight_and_guidance", "generate_whisper_inner_thought", "revise_identity",
}
LANGUAGE_INSTRUCTIONS = {
  "zh-TW": ("Write every natural-language sentence you produce (dialogue, "
            "thoughts, notes, status) in Traditional Chinese (繁體中文, Taiwan "
            "usage). Keep names, place names, numbers, JSON keys and any "
            "required output format exactly as instructed."),
}

COMPLETION_INSTRUCTIONS = (
  "You are a text-completion engine. The input is an unfinished document. "
  "Continue it exactly from where it stops and output only the continuation "
  "-- do not repeat the input, do not add explanations or formatting.")

_current_task: contextvars.ContextVar[str] = contextvars.ContextVar(
  "ga_task", default="unknown")


class FatalLLMError(BaseException):
  """A problem retries cannot fix (bad key, unknown model). Stops the run.

  Deliberately a BaseException: the original code wraps model calls in many
  `except Exception` clauses (formerly bare `except:`) that turn errors into
  fallback answers. A fatal error must not be absorbed that way.
  """


@dataclass
class Usage:
  calls: int = 0
  failures: int = 0
  input_tokens: int = 0
  cached_tokens: int = 0
  output_tokens: int = 0
  reasoning_tokens: int = 0
  embed_calls: int = 0
  embed_tokens: int = 0
  seconds: float = 0.0
  cost_usd: float = 0.0
  by_task: dict = field(default_factory=dict)

  def as_dict(self) -> dict:
    return {k: (round(v, 6) if isinstance(v, float) else v)
            for k, v in self.__dict__.items()}


def _env(name: str, default: str) -> str:
  """Environment value; unset and empty both mean "use the default"
  (config files pass empty values for settings left blank)."""
  value = os.environ.get(name)
  return default if value is None or value.strip() == "" else value.strip()


def _env_float(name: str, default: float) -> float:
  try:
    return float(_env(name, str(default)))
  except ValueError:
    return default


class LLM:
  def __init__(self, client=None):
    self.model = _env("GA_MODEL", "gpt-6-luna")
    self.embed_model = _env("GA_EMBED_MODEL", "text-embedding-3-small")
    # text-embedding-3-* can return shorter vectors; 512 keeps 16 personas x
    # 100 days of memory in a few GB of RAM. Empty = model default.
    dims = os.environ.get("GA_EMBED_DIMENSIONS", "512").strip()
    self.embed_dimensions = int(dims) if dims else None
    # Economical defaults: routine prompts do not think, cognition thinks a
    # little. (The original ran on GPT-3.5, which did not reason at all.)
    self.effort_high = _env("GA_REASONING_HIGH", "low")
    self.effort_low = _env("GA_REASONING_LOW", "none")
    self.api = _env("GA_API", "responses")
    self.base_url = _env("GA_BASE_URL", "") or None
    self.send_reasoning = _env("GA_SEND_REASONING", "0") == "1"
    self.language = _env("GA_LANGUAGE", "zh-TW")
    try:
      self.embed_extra = json.loads(_env("GA_EMBED_EXTRA_BODY", "{}"))
    except ValueError as exc:
      raise FatalLLMError(f"GA_EMBED_EXTRA_BODY is not valid JSON: {exc}") from exc
    self.overrides = {}
    for pair in _env("GA_REASONING_OVERRIDES", "").split(","):
      if "=" in pair:
        k, v = pair.split("=", 1)
        self.overrides[k.strip()] = v.strip()
    self.service_tier = _env("GA_SERVICE_TIER", "auto")
    self.max_output_tokens = int(_env("GA_MAX_OUTPUT_TOKENS", "4000"))
    self.max_retries = int(_env("GA_MAX_RETRIES", "6"))
    self.timeout = _env_float("GA_TIMEOUT", 180)
    tier_factor = 0.5 if self.service_tier == "flex" else 1.0
    self.price_in = _env_float("GA_PRICE_INPUT", 0.10) * tier_factor
    self.price_cached = _env_float("GA_PRICE_CACHED", 0.01) * tier_factor
    self.price_out = _env_float("GA_PRICE_OUTPUT", 0.50) * tier_factor
    self.price_embed = _env_float("GA_PRICE_EMBED", 0.02)
    self.usage = Usage()
    self._lock = threading.Lock()
    self._slots = threading.BoundedSemaphore(
      int(_env("GA_MAX_CONCURRENCY", "16")))
    self._log_path = os.environ.get("GA_USAGE_LOG")
    rpm = float(_env("GA_MAX_RPM", "0"))
    self._min_interval = 60.0 / rpm if rpm > 0 else 0.0
    self._next_slot = 0.0
    self._rate_lock = threading.Lock()
    self._client = client
    self._consecutive_failures = 0

  # ------------------------------------------------------------------ client
  @property
  def client(self):
    if self._client is None:
      key = os.environ.get("GA_API_KEY") or os.environ.get("OPENAI_API_KEY")
      if not key:
        raise FatalLLMError("No API key: set OPENAI_API_KEY (or GA_API_KEY)")
      from openai import OpenAI
      self._client = OpenAI(api_key=key, base_url=self.base_url,
                            timeout=self.timeout, max_retries=0)
    return self._client

  def effort_for(self, task: str) -> str:
    if task in self.overrides:
      return self.overrides[task]
    return self.effort_high if task in COGNITION_TASKS else self.effort_low

  # ------------------------------------------------------------------ calls
  def complete(self, prompt: str, *, completion_style: bool,
               stop=None, task: str | None = None) -> str:
    """One text generation. Raises after retries are exhausted."""
    task = task or _current_task.get()
    effort = self.effort_for(task)
    instructions = self.instructions_for(task, completion_style)
    started = time.monotonic()
    if self.api == "chat":
      messages = ([{"role": "system", "content": instructions}] if instructions else [])
      messages.append({"role": "user", "content": prompt})
      kwargs = dict(model=self.model, messages=messages, max_tokens=self.max_output_tokens)
      if self.send_reasoning:
        kwargs["reasoning_effort"] = effort
      response = self._with_retries(lambda: self.client.chat.completions.create(**kwargs))
      text = strip_thinking(response.choices[0].message.content or "")
    else:
      kwargs = dict(model=self.model, input=prompt,
                    reasoning={"effort": effort},
                    max_output_tokens=self.max_output_tokens,
                    prompt_cache_key=f"ga-{task}")
      if instructions:
        kwargs["instructions"] = instructions
      if self.service_tier != "auto":
        kwargs["service_tier"] = self.service_tier
      response = self._with_retries(lambda: self.client.responses.create(**kwargs))
      text = response.output_text or ""
    if completion_style:
      text = apply_stop(text, stop)
    self._record(task, effort, response, time.monotonic() - started)
    return text

  def instructions_for(self, task: str, completion_style: bool) -> str:
    parts = []
    if completion_style:
      parts.append(COMPLETION_INSTRUCTIONS)
    if task in LANGUAGE_TASKS and self.language in LANGUAGE_INSTRUCTIONS:
      parts.append(LANGUAGE_INSTRUCTIONS[self.language])
    return "\n\n".join(parts)

  def embed(self, text: str) -> list[float]:
    started = time.monotonic()
    extra = {"dimensions": self.embed_dimensions} if self.embed_dimensions else {}
    if self.embed_extra:
      extra["extra_body"] = self.embed_extra
    response = self._with_retries(lambda: self.client.embeddings.create(
      model=self.embed_model, input=[text], **extra))
    tokens = getattr(getattr(response, "usage", None), "total_tokens", 0) or 0
    with self._lock:
      u = self.usage
      u.embed_calls += 1
      u.embed_tokens += tokens
      u.cost_usd += tokens * self.price_embed / 1e6
      u.seconds += time.monotonic() - started
    return list(response.data[0].embedding)

  def _with_retries(self, fn):
    from openai import (APIConnectionError, APITimeoutError, AuthenticationError,
                        InternalServerError, NotFoundError,
                        PermissionDeniedError, RateLimitError)
    retryable = (RateLimitError, APIConnectionError, APITimeoutError,
                 InternalServerError)
    delay = 2.0
    for attempt in range(self.max_retries + 1):
      try:
        with self._slots:
          self._wait_for_rate_limit()
          result = fn()
        self._consecutive_failures = 0
        return result
      except (AuthenticationError, PermissionDeniedError, NotFoundError) as exc:
        raise FatalLLMError(f"{type(exc).__name__}: {exc}") from exc
      except retryable:
        if attempt == self.max_retries:
          self._fail()
          raise
        time.sleep(delay + random.random())
        delay = min(delay * 2, 60)
      except Exception:
        self._fail()
        raise

  def _wait_for_rate_limit(self):
    """Spaces request starts evenly when GA_MAX_RPM is set."""
    if not self._min_interval:
      return
    with self._rate_lock:
      now = time.monotonic()
      start = max(now, self._next_slot)
      self._next_slot = start + self._min_interval
    if start > now:
      time.sleep(start - now)

  def _fail(self):
    with self._lock:
      self.usage.failures += 1
      self._consecutive_failures += 1
      if self._consecutive_failures >= 50:
        raise FatalLLMError("50 consecutive API failures -- stopping instead "
                            "of filling the simulation with fallbacks")

  def _record(self, task, effort, response, seconds):
    usage = getattr(response, "usage", None)
    # Responses API names first, Chat Completions names as the fallback.
    inp = (getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", 0) or 0)
    out = (getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", 0) or 0)
    in_details = (getattr(usage, "input_tokens_details", None)
                  or getattr(usage, "prompt_tokens_details", None))
    out_details = (getattr(usage, "output_tokens_details", None)
                   or getattr(usage, "completion_tokens_details", None))
    cached = getattr(in_details, "cached_tokens", 0) or 0
    reasoning = getattr(out_details, "reasoning_tokens", 0) or 0
    cost = ((inp - cached) * self.price_in + cached * self.price_cached
            + out * self.price_out) / 1e6
    with self._lock:
      u = self.usage
      u.calls += 1
      u.input_tokens += inp
      u.cached_tokens += cached
      u.output_tokens += out
      u.reasoning_tokens += reasoning
      u.seconds += seconds
      u.cost_usd += cost
      t = u.by_task.setdefault(task, {"calls": 0, "cost_usd": 0.0,
                                      "output_tokens": 0, "seconds": 0.0})
      t["calls"] += 1
      t["cost_usd"] += cost
      t["output_tokens"] += out
      t["seconds"] += seconds
      if self._log_path:
        with open(self._log_path, "a", encoding="utf-8") as fh:
          fh.write(json.dumps({
            "t": round(time.time(), 3), "task": task, "effort": effort,
            "in": inp, "cached": cached, "out": out, "reasoning": reasoning,
            "sec": round(seconds, 3), "usd": round(cost, 7)}) + "\n")


def strip_thinking(text: str) -> str:
  """Some chat models (e.g. on NIM) put their reasoning in <think> tags."""
  if "</think>" in text:
    text = text.split("</think>", 1)[1]
  return text.lstrip()


def apply_stop(text: str, stop) -> str:
  """Emulate the completion API's stop sequences on a model's output."""
  if not stop:
    return text
  if isinstance(stop, str):
    stop = [stop]
  cut = len(text)
  for s in stop:
    if s:
      i = text.find(s)
      if i != -1:
        cut = min(cut, i)
  return text[:cut]


@contextlib.contextmanager
def task(name: str):
  token = _current_task.set(name)
  try:
    yield
  finally:
    _current_task.reset(token)


def tag_task(fn):
  """Decorator: calls made inside fn are attributed to fn's task name."""
  name = fn.__name__.removeprefix("run_gpt_prompt_").removeprefix("run_gpt_")

  @functools.wraps(fn)
  def wrapper(*args, **kwargs):
    with task(name):
      return fn(*args, **kwargs)
  return wrapper


_default: LLM | None = None
_default_lock = threading.Lock()


def get_llm() -> LLM:
  global _default
  with _default_lock:
    if _default is None:
      _default = LLM()
    return _default


def set_llm(llm: LLM | None) -> None:
  """Swap the shared instance (used by tests and by the runner)."""
  global _default
  with _default_lock:
    _default = llm
