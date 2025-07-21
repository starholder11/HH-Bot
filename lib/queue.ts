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
    const error = 'SQS_QUEUE_URL environment variable is not set - cannot enqueue analysis job';
    console.error('[enqueueAnalysisJob]', error);
    throw new Error(error);
  }

  console.log('[enqueueAnalysisJob] Attempting to send message to SQS queue:', QueueUrl);
  console.log('[enqueueAnalysisJob] Payload:', JSON.stringify(payload));
  console.log('[enqueueAnalysisJob] AWS region:', process.env.AWS_REGION ?? 'us-east-1');

  try {
    const command = new SendMessageCommand({
      QueueUrl,
      MessageBody: JSON.stringify(payload),
    });

    console.log('[enqueueAnalysisJob] Sending command to SQS...');
    const result = await sqsClient.send(command);
    console.log('[enqueueAnalysisJob] SQS send successful, MessageId:', result.MessageId);
    console.log('[enqueueAnalysisJob] Job enqueued successfully for assetId:', payload.assetId);
  } catch (err) {
    console.error('[enqueueAnalysisJob] Failed to enqueue job');
    console.error('[enqueueAnalysisJob] Error details:', err);
    console.error('[enqueueAnalysisJob] Error name:', (err as any)?.name);
    console.error('[enqueueAnalysisJob] Error code:', (err as any)?.code);
    console.error('[enqueueAnalysisJob] Error message:', (err as any)?.message);
    throw err;
  }
}
