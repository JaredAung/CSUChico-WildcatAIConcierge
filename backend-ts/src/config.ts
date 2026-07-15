import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

class Settings {
  readonly APP_NAME: string;
  readonly APP_VERSION: string;
  readonly DEV_MODE: boolean;
  readonly CORS_ORIGINS: string;
  readonly CHROMA_PERSIST_DIR: string;
  readonly CHROMA_COLLECTION_NAME: string;
  readonly EMBEDDING_MODEL_NAME: string;
  readonly KNOWLEDGE_BASE_DIR: string;
  readonly TOP_K_RESULTS: number;
  readonly CONFIDENCE_THRESHOLD: number;
  readonly AWS_REGION: string;
  readonly AWS_ACCESS_KEY_ID: string;
  readonly AWS_SECRET_ACCESS_KEY: string;
  readonly BEDROCK_MODEL_ID: string;
  readonly BEDROCK_EMBEDDING_MODEL_ID: string;

  constructor() {
    this.APP_NAME = process.env.APP_NAME || 'Wildcat AI Concierge';
    this.APP_VERSION = process.env.APP_VERSION || '1.0.0';
    this.DEV_MODE = process.env.DEV_MODE !== 'false';
    this.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000';
    this.CHROMA_PERSIST_DIR = process.env.CHROMA_PERSIST_DIR || './data/chroma';
    this.CHROMA_COLLECTION_NAME = process.env.CHROMA_COLLECTION_NAME || 'wildcat_knowledge';
    this.EMBEDDING_MODEL_NAME = process.env.EMBEDDING_MODEL_NAME || 'Xenova/all-MiniLM-L6-v2';
    this.KNOWLEDGE_BASE_DIR = process.env.KNOWLEDGE_BASE_DIR || '../backend/data/knowledge_base';
    this.TOP_K_RESULTS = parseInt(process.env.TOP_K_RESULTS || '5', 10);
    this.CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.65');
    this.AWS_REGION = process.env.AWS_REGION || 'us-west-2';
    this.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
    this.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
    this.BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    this.BEDROCK_EMBEDDING_MODEL_ID = process.env.BEDROCK_EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';
  }

  get bedrockConfigured(): boolean {
    return !!(
      this.AWS_ACCESS_KEY_ID &&
      this.AWS_ACCESS_KEY_ID !== 'your_key_here' &&
      this.AWS_SECRET_ACCESS_KEY &&
      this.AWS_SECRET_ACCESS_KEY !== 'your_secret_here'
    );
  }

  get corsOriginsList(): string[] {
    return this.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
}

let _settings: Settings | null = null;

export function getSettings(): Settings {
  if (!_settings) {
    _settings = new Settings();
  }
  return _settings;
}

export { Settings };
