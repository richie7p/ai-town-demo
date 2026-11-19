"""Model layer: request shape, stop emulation, effort routing, cost, retries."""
from types import SimpleNamespace

import httpx2
import openai
import pytest

import llm


def usage(inp=100, out=50, cached=0, reasoning=20):
  return SimpleNamespace(
    input_tokens=inp, output_tokens=out,
    input_tokens_details=SimpleNamespace(cached_tokens=cached),
    output_tokens_details=SimpleNamespace(reasoning_tokens=reasoning))


class FakeResponses:
  def __init__(self, outputs):
    self.outputs = list(outputs)
    self.calls = []

  def create(self, **kwargs):
    self.calls.append(kwargs)
    out = self.outputs.pop(0)
    if isinstance(out, BaseException):
      raise out
    return SimpleNamespace(output_text=out, usage=usage())


class FakeClient:
  def __init__(self, outputs=(), embedding=(0.1, 0.2)):
    self.responses = FakeResponses(outputs)
    self.embeddings = SimpleNamespace(create=lambda **kw: SimpleNamespace(
      data=[SimpleNamespace(embedding=list(embedding))],
      usage=SimpleNamespace(total_tokens=7)))


def api_error(cls, status):
  request = httpx2.Request("POST", "https://api.openai.com/v1/responses")
  return cls("boom", response=httpx2.Response(status, request=request), body=None)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
  for key in ("GA_MODEL", "GA_REASONING_HIGH", "GA_REASONING_LOW", "GA_REASONING_OVERRIDES",
              "GA_SERVICE_TIER", "GA_USAGE_LOG", "GA_API", "GA_BASE_URL", "GA_LANGUAGE",
              "GA_EMBED_EXTRA_BODY", "GA_SEND_REASONING", "GA_EMBED_DIMENSIONS"):
    monkeypatch.delenv(key, raising=False)
  monkeypatch.setattr(llm.time, "sleep", lambda s: None)
  yield
  llm.set_llm(None)


def test_completion_style_request_and_stop_sequences():
  client = FakeClient(["7am\nand then breakfast"])
  model = llm.LLM(client=client)
  with llm.task("wake_up_hour"):
    text = model.complete("Isabella wakes up at", completion_style=True, stop=["\n"])
  assert text == "7am"
  call = client.responses.calls[0]
  assert call["model"] == "gpt-6-luna"
  assert call["reasoning"] == {"effort": "none"}         # routine task, economical
  assert "continue" in call["instructions"].lower()
  assert call["prompt_cache_key"] == "ga-wake_up_hour"
  assert "service_tier" not in call


def test_cognition_tasks_think_harder_and_overrides_win(monkeypatch):
  monkeypatch.setenv("GA_REASONING_OVERRIDES", "event_poignancy=none, daily_plan=high")
  model = llm.LLM(client=FakeClient())
  assert model.effort_for("generate_hourly_schedule") == "low"   # economical defaults
  assert model.effort_for("generate_iterative_chat_utt") == "low"
  assert model.effort_for("revise_identity") == "low"
  assert model.effort_for("pronunciatio") == "none"
  assert model.effort_for("event_poignancy") == "none"
  assert model.effort_for("daily_plan") == "high"


def test_cost_is_accounted_per_task_and_flex_is_half_price(monkeypatch, tmp_path):
  log = tmp_path / "usage.jsonl"
  monkeypatch.setenv("GA_USAGE_LOG", str(log))
  model = llm.LLM(client=FakeClient(["a", "b"]))
  with llm.task("daily_plan"):
    model.complete("x", completion_style=False)
  model.embed("hello")
  # 100 input * $0.10 + 50 output * $0.50 per million, plus 7 embedding tokens * $0.02
  expected = (100 * 0.10 + 50 * 0.50 + 7 * 0.02) / 1e6
  assert model.usage.cost_usd == pytest.approx(expected)
  assert model.usage.by_task["daily_plan"]["calls"] == 1
  assert model.usage.reasoning_tokens == 20
  assert log.read_text().count("\n") == 1

  monkeypatch.setenv("GA_SERVICE_TIER", "flex")
  flex = llm.LLM(client=FakeClient(["a"]))
  flex.complete("x", completion_style=False)
  assert flex.usage.cost_usd == pytest.approx((100 * 0.05 + 50 * 0.25) / 1e6)


def test_transient_errors_are_retried():
  client = FakeClient([api_error(openai.RateLimitError, 429),
                       api_error(openai.InternalServerError, 500), "ok"])
  assert llm.LLM(client=client).complete("x", completion_style=False) == "ok"
  assert len(client.responses.calls) == 3


def test_bad_key_is_fatal_and_survives_broad_except():
  model = llm.LLM(client=FakeClient([api_error(openai.AuthenticationError, 401)]))
  with pytest.raises(llm.FatalLLMError):
    try:
      model.complete("x", completion_style=False)
    except Exception:  # the original code is full of these
      pytest.fail("a fatal error must not be swallowed by `except Exception`")


def test_gpt_structure_routes_through_llm():
  from persona.prompt_template import gpt_structure as g
  client = FakeClient(["8am\nignored", '{"output": "😀"}', "plain"])
  llm.set_llm(llm.LLM(client=client))
  params = {"engine": "text-davinci-003", "max_tokens": 50, "temperature": 0, "top_p": 1,
            "stream": False, "frequency_penalty": 0, "presence_penalty": 0, "stop": ["\n"]}
  assert g.GPT_request("wakes up at", params) == "8am"
  out = g.ChatGPT_safe_generate_response("emoji?", "😊", "", 1, "x",
                                         lambda r, prompt="": True, lambda r, prompt="": r)
  assert out == "😀"
  assert g.ChatGPT_request("hi") == "plain"
  assert g.get_embedding("text") == [0.1, 0.2]
  assert all("text-davinci" not in str(c) for c in client.responses.calls)


def test_prompt_functions_are_tagged_with_their_task():
  from persona.prompt_template import run_gpt_prompt as r
  seen = []
  class Spy(llm.LLM):
    def complete(self, prompt, **kw):
      seen.append(llm._current_task.get())
      return "7am"
  llm.set_llm(Spy(client=object()))
  persona = SimpleNamespace(scratch=SimpleNamespace(
    get_str_iss=lambda: "Isabella is a cafe owner", get_str_lifestyle=lambda: "early riser",
    get_str_firstname=lambda: "Isabella"))
  r.run_gpt_prompt_wake_up_hour(persona)
  assert seen and set(seen) == {"wake_up_hour"}


class FakeChat:
  def __init__(self, outputs):
    self.outputs = list(outputs)
    self.calls = []

  def create(self, **kwargs):
    self.calls.append(kwargs)
    out = self.outputs.pop(0)
    return SimpleNamespace(
      choices=[SimpleNamespace(message=SimpleNamespace(content=out))],
      usage=SimpleNamespace(prompt_tokens=80, completion_tokens=30,
                            completion_tokens_details=SimpleNamespace(reasoning_tokens=10)))


def test_chat_completions_mode_for_nvidia_nim(monkeypatch):
  monkeypatch.setenv("GA_API", "chat")
  monkeypatch.setenv("GA_MODEL", "meta/llama-3.3-70b-instruct")
  monkeypatch.setenv("GA_EMBED_DIMENSIONS", "")
  monkeypatch.setenv("GA_EMBED_EXTRA_BODY", '{"input_type": "passage", "truncate": "END"}')
  monkeypatch.setenv("GA_PRICE_INPUT", "0")
  monkeypatch.setenv("GA_PRICE_OUTPUT", "0")
  chat = FakeChat(["<think>hmm</think>7am\nlater", "你好！最近好嗎？"])
  embed_calls = []
  client = SimpleNamespace(chat=SimpleNamespace(completions=chat), embeddings=SimpleNamespace(
    create=lambda **kw: embed_calls.append(kw) or SimpleNamespace(
      data=[SimpleNamespace(embedding=[0.5, 0.5])], usage=SimpleNamespace(total_tokens=3))))
  model = llm.LLM(client=client)
  with llm.task("wake_up_hour"):
    assert model.complete("wakes up at", completion_style=True, stop=["\n"]) == "7am"
  first = chat.calls[0]
  assert first["model"] == "meta/llama-3.3-70b-instruct"
  assert first["messages"][0]["role"] == "system" and "continue" in first["messages"][0]["content"].lower()
  assert "reasoning_effort" not in first and "繁體中文" not in first["messages"][0]["content"]
  with llm.task("generate_iterative_chat_utt"):
    assert model.complete("say hi", completion_style=False) == "你好！最近好嗎？"
  assert "繁體中文" in chat.calls[1]["messages"][0]["content"]
  assert model.usage.input_tokens == 160 and model.usage.cost_usd == 0
  model.embed("memory")
  assert embed_calls[0]["extra_body"] == {"input_type": "passage", "truncate": "END"}
  assert "dimensions" not in embed_calls[0]


def test_english_mode_has_no_language_instruction(monkeypatch):
  monkeypatch.setenv("GA_LANGUAGE", "en")
  model = llm.LLM(client=FakeClient(["ok"]))
  with llm.task("generate_iterative_chat_utt"):
    model.complete("say hi", completion_style=False)
  assert "instructions" not in model.client.responses.calls[0]


def test_requests_per_minute_cap(monkeypatch):
  monkeypatch.setenv("GA_MAX_RPM", "60")          # one request per second
  slept = []
  clock = {"t": 100.0}
  monkeypatch.setattr(llm.time, "monotonic", lambda: clock["t"])
  monkeypatch.setattr(llm.time, "sleep", lambda s: slept.append(round(s, 3)))
  model = llm.LLM(client=FakeClient(["a", "b", "c"]))
  for _ in range(3):
    model.complete("x", completion_style=False)
  assert slept == [1.0, 2.0]                      # 2nd and 3rd calls wait their turn
