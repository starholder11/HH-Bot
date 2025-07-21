import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// SQS client is created once per Lambda/Edge/Node instance and reused
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

/**
 * Push a JSON payload onto the configured SQS queue.
 * The queue URL **must** be supplied via `SQS_QUEUE_URL` env var.
 */
export async function enqueueAnalysisJob(payload: Record<string, unknown>): Promise<void> {
  const QueueUrl = process.env.SQS_QUEUE_URL;
  if (!QueueUrl) {
    console.error('[enqueueAnalysisJob] Missing SQS_QUEUE_URL env var – job NOT enqueued');
    return;
  }

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl,
        MessageBody: JSON.stringify(payload),
      }),
    );
    console.log('[enqueueAnalysisJob] Job enqueued', payload);
  } catch (err) {
    console.error('[enqueueAnalysisJob] Failed to enqueue job', err);
    throw err;
  }
}
