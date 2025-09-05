// Lambda worker for real-time conversation summarization
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const OpenAI = require('openai');

const s3Client = new S3Client({ region: 'us-east-1' });
const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });
const bucketName = process.env.S3_BUCKET;

let openai;

// Get OpenAI API key from Secrets Manager
async function getOpenAIClient() {
  if (openai) return openai;

  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: 'hh-bot-openai-api-key'
    }));

    const apiKey = response.SecretString;
    openai = new OpenAI({ apiKey });
    return openai;
  } catch (error) {
    console.error('Failed to get OpenAI API key from Secrets Manager:', error);
    throw error;
  }
}

exports.handler = async (event) => {
  const { textAssetId, userMessage, assistantResponse, conversationId, editMode, editInstructions } = event;
  const correlationId = event.correlationId || `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[${correlationId}] Background summarizer triggered for: ${textAssetId}`);
  console.log(`[${correlationId}] Edit Mode: ${editMode || false}`);
  if (editMode) console.log(`[${correlationId}] Edit Instructions: ${editInstructions}`);

  try {
    // Load current S3 text asset
    const assetKey = `media-labeling/assets/${textAssetId}.json`;
    const getResponse = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: assetKey
    }));

    const currentAsset = JSON.parse(await streamToString(getResponse.Body));

    if (!currentAsset?.metadata?.scribe_enabled) {
      console.log(`[${correlationId}] Scribe disabled, skipping`);
      return { statusCode: 200, body: 'Scribe disabled' };
    }

    // Generate narrative update
    // Generate content update - either conversation integration or editing
    let updatedContent;
    if (editMode && editInstructions) {
      // Document editing mode
      updatedContent = await generateDocumentEdit(
        editInstructions,
        currentAsset.content || '',
        currentAsset.title,
        correlationId
      );
    } else {
      // Regular conversation integration mode
      const conversationTurn = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
      updatedContent = await generateNarrativeUpdate(
        conversationTurn,
        currentAsset.content || '',
        currentAsset.title,
        correlationId
      );
    }

    // Update S3 text asset
    const updatedAsset = {
      ...currentAsset,
      content: updatedContent,
      updated_at: new Date().toISOString(),
      metadata: {
        ...currentAsset.metadata,
        last_scribe_update: new Date().toISOString(),
        word_count: updatedContent.split(/\s+/).filter(w => w.length > 0).length,
        character_count: updatedContent.length
      }
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: assetKey,
      Body: JSON.stringify(updatedAsset, null, 2),
      ContentType: 'application/json'
    }));

    console.log(`[${correlationId}] ✅ Scribe update completed`);
    return { statusCode: 200, body: JSON.stringify({ success: true, correlationId }) };

  } catch (error) {
    console.error(`[${correlationId}] ❌ Summarizer failed:`, error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message, correlationId }) };
  }
};

async function generateNarrativeUpdate(conversationTurn, existingContent, documentTitle, correlationId) {
  const openaiClient = await getOpenAIClient();

  const systemPrompt = `You are a real-time narrative synthesizer for the Starholder universe.
Take this conversation turn and seamlessly weave it into the existing document.
Write in flowing, engaging prose that captures the essence of the discussion.
Maintain narrative coherence while integrating new information naturally.
Return the complete updated document.`;

  const updatePrompt = `
DOCUMENT: ${documentTitle}

CURRENT CONTENT:
${existingContent}

NEW CONVERSATION:
${conversationTurn}

Integrate this conversation naturally into the document. Return the complete updated text.`;

  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: updatePrompt }
    ],
    temperature: 0.7,
    max_tokens: 8000
  });

  return response.choices[0]?.message?.content || existingContent;
}

async function generateDocumentEdit(editInstructions, existingContent, documentTitle, correlationId) {
  console.log(`[${correlationId}] Generating document edit for: ${documentTitle}`);
  console.log(`[${correlationId}] Edit instructions: ${editInstructions}`);
  
  const openaiClient = await getOpenAIClient();
  
  const systemPrompt = `You are a master document editor for the Starholder universe. 
You receive specific editing instructions and apply them to existing documents with precision and creativity.
Follow the user's editing directions exactly while maintaining narrative coherence and the document's voice.
You can rework sections, change tone, add dialogue, restructure content, or make any requested modifications.
Return the complete updated document after applying the requested changes.`;

  const editPrompt = `
DOCUMENT TITLE: ${documentTitle}

CURRENT DOCUMENT:
${existingContent}

EDITING INSTRUCTIONS:
${editInstructions}

TASK: Apply the editing instructions to the document. Make the requested changes while maintaining quality and coherence. Return the complete updated document.
`;

  console.log(`[${correlationId}] Calling OpenAI for document editing`);
  
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: editPrompt }
    ],
    temperature: 0.7,
    max_tokens: 8000
  });

  const result = response.choices[0]?.message?.content || existingContent;
  console.log(`[${correlationId}] Document edit completed: ${result.length} chars`);
  
  return result;
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
