import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const metadataQueue = new Queue('metadata', { connection });
export const imagePromptQueue = new Queue('image-prompt', { connection });
export const analyticsQueue = new Queue('analytics', { connection });

export function getWorker(name: string, handler: (job: any) => Promise<void>) {
  return new Worker(name, handler, { connection });
}

export async function closeQueue() {
  await Promise.all([metadataQueue.close(), imagePromptQueue.close(), analyticsQueue.close()]);
  await connection.quit();
}
