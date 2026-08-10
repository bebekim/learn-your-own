import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parseTelemetryEvent, type TelemetryEvent } from './contract.ts';
import { telemetryEventToHookInput } from './compile.ts';
import { recordHookEvent } from '../hooks/ingestion.ts';
import { normalizeHooks } from '../hooks/normalization-runner.ts';
import type { LearningKernel } from '../ledger.ts';

export interface TelemetryServerOptions {
  host?: string;
  port?: number;
}

export interface TelemetryServerHandle {
  server: Server;
  host: string;
  port: number;
  close(): Promise<void>;
}

export async function startTelemetryServer(
  kernel: LearningKernel,
  options: TelemetryServerOptions = {}
): Promise<TelemetryServerHandle> {
  const host = options.host ?? '127.0.0.1';
  const server = createServer((request, response) => {
    void handleRequest(kernel, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 8788, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('telemetry server did not bind to a TCP port');
  return {
    server,
    host,
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function handleRequest(kernel: LearningKernel, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    writeJson(response, 200, { ok: true, service: 'lyo-telemetry' });
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/telemetry') {
    writeJson(response, 404, { ok: false, error: 'not found' });
    return;
  }
  try {
    const body = await readBody(request);
    const parsed = JSON.parse(body) as unknown;
    const rawEvents = Array.isArray(parsed) ? parsed : [parsed];
    const events = rawEvents.map((event, index) => parseTelemetryEvent(event, index + 1));
    const normalized = persistEvents(kernel, events);
    writeJson(response, 202, { ok: true, accepted: events.length, normalized });
  } catch (error) {
    writeJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function persistEvents(kernel: LearningKernel, events: readonly TelemetryEvent[]) {
  kernel.db.exec('begin immediate');
  try {
    for (const event of events) recordHookEvent(kernel, telemetryEventToHookInput(event));
    const normalized = normalizeHooks(kernel, { outcome: 'unknown' });
    kernel.db.exec('commit');
    return normalized;
  } catch (error) {
    kernel.db.exec('rollback');
    throw error;
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}
