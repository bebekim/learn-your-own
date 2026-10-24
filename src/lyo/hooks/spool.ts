import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface JsonSpoolWriteInput {
  spoolDir: string;
  packet: unknown;
  packetId?: string;
}

export interface JsonSpoolWriteResult {
  packetPath: string;
}

export interface JsonSpoolDrainInput<T> {
  spoolDir: string;
  limit?: number;
  parsePacket?: (value: unknown) => T;
  processPacket: (packet: T) => void;
}

export interface JsonSpoolDrainResult {
  processedPackets: number;
  failedPackets: number;
  requeuedPackets: number;
}

export function writeJsonSpoolPacket(input: JsonSpoolWriteInput): JsonSpoolWriteResult {
  const incomingDir = join(input.spoolDir, 'incoming');
  mkdirSync(incomingDir, { recursive: true });
  const fileName = `${Date.now()}-${process.pid}-${randomUUID()}-${safeNamePart(input.packetId ?? 'packet')}.json`;
  const finalPath = join(incomingDir, fileName);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(input.packet)}\n`, 'utf8');
  renameSync(tmpPath, finalPath);
  return { packetPath: finalPath };
}

export function drainJsonSpoolPackets<T>(input: JsonSpoolDrainInput<T>): JsonSpoolDrainResult {
  const incomingDir = join(input.spoolDir, 'incoming');
  const processingDir = join(input.spoolDir, 'processing');
  const processedDir = join(input.spoolDir, 'processed');
  const failedDir = join(input.spoolDir, 'failed');
  mkdirSync(incomingDir, { recursive: true });
  mkdirSync(processingDir, { recursive: true });
  mkdirSync(processedDir, { recursive: true });
  mkdirSync(failedDir, { recursive: true });

  const files = readdirSync(incomingDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .slice(0, input.limit ?? 1000);

  let processedPackets = 0;
  let failedPackets = 0;
  let requeuedPackets = 0;

  for (const fileName of files) {
    const incomingPath = join(incomingDir, fileName);
    const processingPath = join(processingDir, fileName);
    try {
      renameSync(incomingPath, processingPath);
    } catch {
      continue;
    }

    let packet: T;
    try {
      const parsed = JSON.parse(readFileSync(processingPath, 'utf8'));
      packet = input.parsePacket ? input.parsePacket(parsed) : parsed as T;
    } catch {
      failedPackets += 1;
      try {
        renameSync(processingPath, join(failedDir, fileName));
      } catch {
        // Leave the packet in processing for manual inspection if the move fails.
      }
      continue;
    }

    try {
      input.processPacket(packet);
      processedPackets += 1;
      renameSync(processingPath, join(processedDir, fileName));
    } catch {
      requeuedPackets += 1;
      try {
        renameSync(processingPath, incomingPath);
      } catch {
        // Leave the packet in processing for manual inspection if the move fails.
      }
    }
  }

  return { processedPackets, failedPackets, requeuedPackets };
}

function safeNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 96);
}
