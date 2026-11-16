import { loadEnvFile } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalServer } from './server/http.mjs';
import { TownSessions } from './server/llm-sessions.mjs';
import { createDecisionClient, DEFAULT_MODEL } from './server/llm-policy.mjs';

const root = dirname(fileURLToPath(import.meta.url));
try { loadEnvFile(join(root, '.env.local')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('無法讀取本機環境設定。'); }
const port = Number(process.env.PORT || 4173);
const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
const requestedLimit = Number(process.env.LLM_CALL_LIMIT || 1024);
const callLimit = Number.isSafeInteger(requestedLimit) && requestedLimit >= 8 && requestedLimit <= 10000 ? requestedLimit : 1024;
const sessions = new TownSessions({ decide: createDecisionClient({ apiKey: process.env.OPENAI_API_KEY, model }), model,
  configured: Boolean(process.env.OPENAI_API_KEY), callLimit, outputDir: join(root, 'output', 'llm-runs') });
const server = createLocalServer({ root, sessions });
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `連接埠 ${port} 已使用，請設定 PORT 後再啟動。` : '本機服務無法啟動。'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`AI 小鎮 demo：http://127.0.0.1:${server.address().port}\n僅限本機；Ctrl+C 停止。`));
