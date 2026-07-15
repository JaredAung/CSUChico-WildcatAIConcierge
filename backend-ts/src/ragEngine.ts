import fs from 'fs';
import path from 'path';
import { getSettings, Settings } from './config';
import { ChatMessage } from './models';

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const SPANISH_INDICATORS: RegExp[] = [
  /\bcómo\b/i, /\bdónde\b/i, /\bqué\b/i, /\bcuál\b/i, /\bcuándo\b/i,
  /\bquién\b/i, /\bpor\s+favor\b/i, /\bgracias\b/i, /\bnecesito\b/i,
  /\bquiero\b/i, /\bpuedo\b/i, /\bhay\b/i, /\bestoy\b/i, /\btengo\b/i,
  /\bpuede\b/i, /\bcómo\s+puedo\b/i, /\bcómo\s+me\b/i,
  /\bestudiant[eo]\b/i, /\buniversidad\b/i, /\bcampus\b.*\bservicios\b/i,
  /\bservicio[s]?\b/i, /\bapartamento\b/i, /\bestacionamiento\b/i,
  /\bcomida\b/i, /\bcafetería\b/i, /\baccesibilidad\b/i, /\bayuda\b/i,
  /\bclases\b/i, /\bhorario\b/i, /\bmatrícula\b/i, /\bbeca\b/i,
  /\bcomo\b/i, /\bdonde\b/i, /\bque\b/i, /\bpara\b.*\bestudiant/i,
];

export function detectLanguage(text: string): string {
  const textLower = text.toLowerCase();
  for (const pattern of SPANISH_INDICATORS) {
    if (pattern.test(textLower)) {
      return 'es';
    }
  }
  return 'en';
}

// ---------------------------------------------------------------------------
// Workflow intent patterns
// ---------------------------------------------------------------------------

const WORKFLOW_PATTERNS: Record<string, RegExp[]> = {
  facility_rental: [
    /\brent\b/i, /\brental\b/i, /\bbook\s+a\s+(room|venue|space|facility)\b/i,
    /\breserve\s+a\s+(room|venue|space|facility)\b/i, /\bfacility\b/i,
    /\bvenue\b/i, /\bevent\s+space\b/i,
  ],
  accommodations: [
    /\baccommodation/i, /\bdisability\b/i, /\barc\b/i,
    /\baccessibility\b/i, /\bextended\s+time\b/i, /\btest\s+taking\b/i,
    /\bnote.?taking\b/i, /\b504\b/i, /\biep\b/i,
  ],
  parking_permit: [
    /\bpark(ing)?\s+permit\b/i, /\bbuy\s+a\s+permit\b/i,
    /\bpurchase\s+a\s+permit\b/i, /\bparking\s+pass\b/i,
    /\bhow\s+do\s+i\s+get\s+a\s+park/i, /\bpermit\b.*\bpark/i,
  ],
  event_registration: [
    /\bregister\s+(an?\s+)?event\b/i, /\bevent\s+registration\b/i,
    /\bhost\s+an?\s+event\b/i, /\bplan\s+an?\s+event\b/i,
    /\borganize\s+an?\s+event\b/i, /\bcampus\s+event\b/i,
  ],
};

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

interface DocumentChunk {
  id: string;
  text: string;
  metadata: {
    title: string;
    url: string;
    type: string;
    source: string;
  };
}

// ---------------------------------------------------------------------------
// In-memory vector store (fallback when ChromaDB server unavailable)
// ---------------------------------------------------------------------------

class InMemoryVectorStore {
  private documents: { id: string; text: string; metadata: any; embedding: number[] }[] = [];

  async count(): Promise<number> {
    return this.documents.length;
  }

  async get(opts: { include?: string[] }): Promise<{ ids: string[] }> {
    return { ids: this.documents.map((d) => d.id) };
  }

  async upsert(params: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: any[];
  }): Promise<void> {
    for (let i = 0; i < params.ids.length; i++) {
      const existingIdx = this.documents.findIndex((d) => d.id === params.ids[i]);
      const entry = {
        id: params.ids[i],
        text: params.documents[i],
        metadata: params.metadatas[i],
        embedding: params.embeddings[i],
      };
      if (existingIdx >= 0) {
        this.documents[existingIdx] = entry;
      } else {
        this.documents.push(entry);
      }
    }
  }

  async query(params: {
    queryEmbeddings: number[][];
    nResults: number;
    include: string[];
  }): Promise<{ documents: string[][]; metadatas: any[][]; distances: number[][] }> {
    const queryEmb = params.queryEmbeddings[0];
    const scored = this.documents.map((doc) => ({
      ...doc,
      distance: this._cosineDistance(queryEmb, doc.embedding),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    const top = scored.slice(0, params.nResults);

    return {
      documents: [top.map((d) => d.text)],
      metadatas: [top.map((d) => d.metadata)],
      distances: [top.map((d) => d.distance)],
    };
  }

  private _cosineDistance(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
    return 1 - similarity;
  }
}

// ---------------------------------------------------------------------------
// RAGEngine
// ---------------------------------------------------------------------------

export class RAGEngine {
  private settings: Settings;
  private collection: any = null;
  private embedFn: ((texts: string[]) => Promise<number[][]>) | null = null;
  private bedrockClient: any = null;
  private initialized = false;

  constructor() {
    this.settings = getSettings();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this._setupChroma();

    if (this.settings.DEV_MODE || !this.settings.bedrockConfigured) {
      await this._setupDevEmbeddings();
      console.log('RAGEngine started in DEV mode (@xenova/transformers).');
    } else {
      await this._setupBedrock();
      console.log('RAGEngine started in PROD mode (AWS Bedrock).');
    }

    await this._loadDocuments();
    this.initialized = true;
  }

  private async _setupChroma(): Promise<void> {
    const persistDir = path.resolve(this.settings.CHROMA_PERSIST_DIR);
    fs.mkdirSync(persistDir, { recursive: true });

    try {
      const { ChromaClient } = await import('chromadb');
      const chromaClient = new ChromaClient();

      this.collection = await chromaClient.getOrCreateCollection({
        name: this.settings.CHROMA_COLLECTION_NAME,
        metadata: { 'hnsw:space': 'cosine' },
      });

      console.log(
        `ChromaDB collection '${this.settings.CHROMA_COLLECTION_NAME}' ready (server mode).`
      );
    } catch (err) {
      console.warn(
        'ChromaDB server not available — using in-memory vector store.',
        (err as Error).message
      );
      this.collection = new InMemoryVectorStore();
    }
  }

  private async _setupDevEmbeddings(): Promise<void> {
    const { pipeline } = await import('@xenova/transformers');
    const embedder = await pipeline('feature-extraction', this.settings.EMBEDDING_MODEL_NAME);

    this.embedFn = async (texts: string[]): Promise<number[][]> => {
      const results: number[][] = [];
      for (const text of texts) {
        const output = await embedder(text, { pooling: 'mean', normalize: true });
        results.push(Array.from(output.data as Float32Array));
      }
      return results;
    };

    console.log(`Embedding model '${this.settings.EMBEDDING_MODEL_NAME}' loaded.`);
  }

  private async _setupBedrock(): Promise<void> {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    this.bedrockClient = new BedrockRuntimeClient({
      region: this.settings.AWS_REGION,
      credentials: {
        accessKeyId: this.settings.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.settings.AWS_SECRET_ACCESS_KEY,
      },
    });

    this.embedFn = async (texts: string[]): Promise<number[][]> => {
      const embeddings: number[][] = [];
      for (const text of texts) {
        const body = JSON.stringify({ inputText: text });
        const command = new InvokeModelCommand({
          modelId: this.settings.BEDROCK_EMBEDDING_MODEL_ID,
          body: new TextEncoder().encode(body),
          contentType: 'application/json',
          accept: 'application/json',
        });
        const response = await this.bedrockClient.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.body));
        embeddings.push(result.embedding);
      }
      return embeddings;
    };

    console.log(
      `Bedrock embedding model '${this.settings.BEDROCK_EMBEDDING_MODEL_ID}' configured.`
    );
  }

  // ------------------------------------------------------------------
  // Document loading
  // ------------------------------------------------------------------

  private async _loadDocuments(): Promise<void> {
    const kbPath = path.resolve(this.settings.KNOWLEDGE_BASE_DIR);

    if (!fs.existsSync(kbPath)) {
      console.log('Knowledge base directory not found — skipping document load.');
      return;
    }

    const files = fs.readdirSync(kbPath);
    if (files.length === 0) {
      console.log('Knowledge base directory empty — skipping document load.');
      return;
    }

    const docs: DocumentChunk[] = [];

    for (const file of files) {
      const filePath = path.join(kbPath, file);
      const ext = path.extname(file).toLowerCase();

      if (ext === '.md' || ext === '.txt') {
        docs.push(...this._parseTextFile(filePath));
      } else if (ext === '.pdf') {
        docs.push(...(await this._parsePdfFile(filePath)));
      } else if (ext === '.docx') {
        docs.push(...(await this._parseDocxFile(filePath)));
      }
    }

    if (docs.length > 0) {
      await this._indexDocuments(docs);
      console.log(`Indexed ${docs.length} chunks from ${kbPath}.`);
    } else {
      console.log('No parseable files found in knowledge base.');
    }
  }

  private _parseTextFile(filePath: string): DocumentChunk[] {
    const text = fs.readFileSync(filePath, 'utf-8');
    const chunks = this._chunkText(text, 500, 50);
    const stem = path.basename(filePath, path.extname(filePath));
    const docType = stem.toLowerCase().includes('policy') ? 'policy' : 'website';

    return chunks.map((chunk, i) => ({
      id: `${stem}-${i}`,
      text: chunk,
      metadata: {
        title: stem.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        url: '',
        type: docType,
        source: filePath,
      },
    }));
  }

  private async _parsePdfFile(filePath: string): Promise<DocumentChunk[]> {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      const text = data.text;
      const chunks = this._chunkText(text, 500, 50);
      const stem = path.basename(filePath, path.extname(filePath));

      return chunks.map((chunk, i) => ({
        id: `${stem}-pdf-${i}`,
        text: chunk,
        metadata: {
          title: stem.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          url: '',
          type: 'pdf',
          source: filePath,
        },
      }));
    } catch (err) {
      console.warn(`Could not parse PDF ${filePath}: ${err}`);
      return [];
    }
  }

  private async _parseDocxFile(filePath: string): Promise<DocumentChunk[]> {
    try {
      const mammoth = await import('mammoth');
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;
      const chunks = this._chunkText(text, 500, 50);
      const stem = path.basename(filePath, path.extname(filePath));

      return chunks.map((chunk, i) => ({
        id: `${stem}-docx-${i}`,
        text: chunk,
        metadata: {
          title: stem.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          url: '',
          type: 'policy',
          source: filePath,
        },
      }));
    } catch (err) {
      console.warn(`Could not parse DOCX ${filePath}: ${err}`);
      return [];
    }
  }

  _chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
    text = text.trim();
    if (!text) return [];
    if (text.length <= chunkSize) return [text];

    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = start + chunkSize;
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;
    }
    return chunks;
  }

  private async _indexDocuments(docs: DocumentChunk[]): Promise<void> {
    if (!docs.length || !this.collection || !this.embedFn) return;

    // Check existing IDs
    let existingIds: Set<string> = new Set();
    try {
      const existing = await this.collection.get({ include: [] });
      if (existing && existing.ids) {
        existingIds = new Set(existing.ids);
      }
    } catch {
      // Collection might be empty
    }

    const newDocs = docs.filter((d) => !existingIds.has(d.id));
    if (!newDocs.length) {
      console.log(`All ${docs.length} documents already indexed.`);
      return;
    }

    const texts = newDocs.map((d) => d.text);
    const embeddings = await this.embedFn(texts);

    await this.collection.upsert({
      ids: newDocs.map((d) => d.id),
      embeddings,
      documents: texts,
      metadatas: newDocs.map((d) => d.metadata),
    });

    console.log(`Upserted ${newDocs.length} new document chunks.`);
  }

  // ------------------------------------------------------------------
  // Querying
  // ------------------------------------------------------------------

  async query(
    question: string,
    chatHistory: ChatMessage[] = []
  ): Promise<{ answer: string; sources: any[]; confidence: number; language: string }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const language = detectLanguage(question);

    if (!this.embedFn || !this.collection) {
      return {
        answer: this._noDataAnswer(language),
        sources: [],
        confidence: 0,
        language,
      };
    }

    // Embed the question
    const qEmbedding = (await this.embedFn([question]))[0];

    // Get collection count
    let count = 1;
    try {
      count = await this.collection.count();
    } catch {
      count = 1;
    }

    const nResults = Math.min(this.settings.TOP_K_RESULTS, Math.max(count, 1));

    // Retrieve top-k chunks from ChromaDB
    const results = await this.collection.query({
      queryEmbeddings: [qEmbedding],
      nResults,
      include: ['documents', 'metadatas', 'distances'],
    });

    const documents: string[] = results.documents?.[0] || [];
    const metadatas: any[] = results.metadatas?.[0] || [];
    const distances: number[] = results.distances?.[0] || [];

    // Convert cosine distances to similarity scores [0, 1]
    const similarities = distances.map((d) => Math.max(0, 1 - d));
    const confidence =
      similarities.length > 0
        ? similarities.reduce((a, b) => a + b, 0) / similarities.length
        : 0;

    // Generate answer
    let answer: string;
    if (this.bedrockClient) {
      answer = await this._bedrockAnswer(question, documents, chatHistory, language);
    } else {
      answer = this._buildMockAnswer(question, documents, metadatas, language);
    }

    return { answer, sources: metadatas, confidence, language };
  }

  private _noDataAnswer(language: string): string {
    if (language === 'es') {
      return (
        'Lo siento, no tengo información específica sobre ese tema en mi ' +
        'base de conocimientos en este momento. Por favor, comuníquese ' +
        'directamente con el departamento correspondiente de CSU Chico para obtener ayuda.'
      );
    }
    return (
      "I'm sorry, I don't have specific information about that topic in my " +
      'knowledge base right now. Please contact the relevant CSU Chico ' +
      'department directly for assistance.'
    );
  }

  private _buildMockAnswer(
    question: string,
    documents: string[],
    metadatas: any[],
    language: string
  ): string {
    if (!documents.length) {
      return this._noDataAnswer(language);
    }

    // Use the top-3 most relevant chunks
    const topDocs = documents.slice(0, 3);
    const topMeta = metadatas.slice(0, 3);

    const intro =
      language === 'es'
        ? `Aquí está lo que encontré sobre **${question.replace(/\?/g, '')}**:\n\n`
        : `Here's what I found regarding your question about **${question.replace(/\?/g, '')}**:\n\n`;

    const bodyParts: string[] = [];
    for (let i = 0; i < topDocs.length; i++) {
      const doc = topDocs[i];
      const meta = topMeta[i] || {};
      const title = meta.title || 'Campus Resource';
      const snippet = doc.length > 300 ? doc.slice(0, 300).trimEnd() + '...' : doc;
      bodyParts.push(`**${title}**: ${snippet}`);
    }

    let sourcesNote = '';
    const urls = topMeta
      .filter((m: any) => m && m.url)
      .map((m: any) => m.url)
      .slice(0, 2);

    if (urls.length > 0) {
      sourcesNote =
        language === 'es'
          ? `\n\nPara más información, visite: ${urls.join(' | ')}`
          : `\n\nFor more details, visit: ${urls.join(' | ')}`;
    }

    return intro + bodyParts.join('\n\n') + sourcesNote;
  }

  private async _bedrockAnswer(
    question: string,
    documents: string[],
    chatHistory: ChatMessage[],
    language: string
  ): Promise<string> {
    const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');

    const context = documents.slice(0, 5).join('\n\n---\n\n');
    let historyText = '';
    if (chatHistory.length > 0) {
      const turns = chatHistory.slice(-6).map((msg) => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        return `${role}: ${msg.content}`;
      });
      historyText = turns.join('\n') + '\n\n';
    }

    const systemPrompt =
      language === 'es'
        ? 'Eres el Conserje Virtual Wildcat, un asistente útil para la Universidad ' +
          'Estatal de California, Chico (CSU Chico). El estudiante escribe en español, ' +
          'por lo tanto DEBES responder completamente en español. ' +
          'Responde usando ÚNICAMENTE el contexto proporcionado. ' +
          'Sé conciso, amable y preciso. Si el contexto no contiene suficiente ' +
          'información, dilo y dirige al estudiante a la oficina universitaria apropiada.'
        : 'You are the Wildcat AI Concierge, a helpful assistant for California State ' +
          'University, Chico (CSU Chico). Answer the student\'s question using ONLY the ' +
          'provided context. Be concise, friendly, and accurate. If the context does ' +
          'not contain enough information, say so and direct the student to the ' +
          'appropriate campus office.';

    const userMessage =
      `Context from CSU Chico knowledge base:\n${context}\n\n` +
      historyText +
      `Student question: ${question}`;

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const command = new InvokeModelCommand({
      modelId: this.settings.BEDROCK_MODEL_ID,
      body: new TextEncoder().encode(body),
      contentType: 'application/json',
      accept: 'application/json',
    });

    const response = await this.bedrockClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.content[0].text;
  }

  // ------------------------------------------------------------------
  // Workflow intent detection
  // ------------------------------------------------------------------

  detectWorkflowIntent(question: string): string | null {
    const qLower = question.toLowerCase();
    for (const [workflowType, patterns] of Object.entries(WORKFLOW_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(qLower)) {
          return workflowType;
        }
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _engineInstance: RAGEngine | null = null;

export function getRagEngine(): RAGEngine {
  if (!_engineInstance) {
    _engineInstance = new RAGEngine();
  }
  return _engineInstance;
}
