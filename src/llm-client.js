// Browser talks only to the local server; credentials never enter this module.
export async function townApi(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Town-Request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let value;
  try { value = await response.json(); } catch { throw new Error('本機服務沒有回應，請確認小鎮服務已啟動。'); }
  if (!response.ok) { const error = new Error(value.message || '本機服務暫時無法完成操作。'); error.code = value.error; throw error; }
  return value;
}
