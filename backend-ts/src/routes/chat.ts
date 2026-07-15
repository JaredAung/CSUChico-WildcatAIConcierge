import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatRequest, ChatResponse, Department, Source } from '../models';
import { DEPARTMENTS } from './knowledge';
import { getWorkflow } from '../workflowEngine';
import { getRagEngine } from '../ragEngine';

const router = Router();

// ---------------------------------------------------------------------------
// Helper — metadata dict → Source model
// ---------------------------------------------------------------------------

function metaToSource(meta: any, excerpt = ''): Source {
  let docType = meta?.type || 'website';
  if (!['website', 'pdf', 'policy', 'faq'].includes(docType)) {
    docType = 'website';
  }
  return {
    title: meta?.title || 'Campus Resource',
    url: meta?.url || '',
    excerpt: excerpt ? excerpt.slice(0, 300) : (meta?.title || ''),
    type: docType as Source['type'],
  };
}

// ---------------------------------------------------------------------------
// Helper — keyword-based fallback department routing
// ---------------------------------------------------------------------------

const DEPT_KEYWORDS: Record<string, string[]> = {
  'Financial Aid Office': ['financial aid', 'fafsa', 'scholarship', 'grant', 'loan', 'tuition'],
  'Admissions Office': ['apply', 'admission', 'application', 'transfer', 'freshmen'],
  'Office of the Registrar': ['register', 'registration', 'transcript', 'graduation', 'enroll'],
  'Accessibility Resource Center (ARC)': ['accommodation', 'disability', 'arc', 'accessibility'],
  'Student Health Services': ['health', 'medical', 'counseling', 'mental health', 'sick'],
  'Housing & Residence Life': ['housing', 'dorm', 'residence', 'room', 'hall'],
  'University Parking Services': ['parking', 'permit', 'lot', 'park'],
  'Career Center': ['career', 'job', 'internship', 'resume', 'interview'],
  'Meriam Library': ['library', 'research', 'book', 'journal', 'study room'],
  'Information Technology (ITSS)': ['it', 'wifi', 'portal', 'canvas', 'email', 'password'],
};

function routeToDepartments(question: string): Department[] {
  const qLower = question.toLowerCase();
  const matched: Department[] = [];

  for (const dept of DEPARTMENTS) {
    const keywords = DEPT_KEYWORDS[dept.name] || [];
    if (keywords.some((kw) => qLower.includes(kw))) {
      matched.push(dept);
    }
  }

  return matched.slice(0, 3);
}

// ---------------------------------------------------------------------------
// POST /chat
// ---------------------------------------------------------------------------

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body: ChatRequest = req.body;

    // Resolve session id
    const sessionId = body.session_id || uuidv4();

    // Extract the latest user turn
    const userMessages = (body.messages || []).filter((m) => m.role === 'user');
    if (!userMessages.length) {
      res.status(422).json({ detail: 'No user message found in messages list.' });
      return;
    }
    const question = userMessages[userMessages.length - 1].content.trim();

    // Build chat history for context (exclude the last user message)
    const history = (body.messages || []).slice(0, -1).filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );

    // Query the RAG engine
    const ragEngine = getRagEngine();
    const { answer, sources: rawMetadatas, confidence, language } = await ragEngine.query(
      question,
      history
    );

    // Convert metadata to Source models
    const sources: Source[] = rawMetadatas
      .filter((meta: any) => meta)
      .map((meta: any) => metaToSource(meta, meta?.title || ''));

    // Detect workflow intent
    const workflowType = ragEngine.detectWorkflowIntent(question);
    const workflow = workflowType ? getWorkflow(workflowType) : null;

    // Department routing
    const departments = routeToDepartments(question);

    const response: ChatResponse = {
      answer,
      sources,
      departments,
      workflow,
      confidence: Math.round(confidence * 10000) / 10000,
      session_id: sessionId,
      detected_language: language,
    };

    res.json(response);
  } catch (err) {
    console.error('RAG query failed:', err);

    // Graceful fallback
    const body: ChatRequest = req.body;
    const sessionId = body?.session_id || uuidv4();
    const userMessages = (body?.messages || []).filter((m: any) => m.role === 'user');
    const question = userMessages.length
      ? userMessages[userMessages.length - 1].content
      : '';

    const fallbackDepartments = routeToDepartments(question);
    let fallbackAnswer: string;

    if (fallbackDepartments.length > 0) {
      fallbackAnswer =
        "I'm having trouble retrieving information right now. " +
        'Here are the campus departments that may be able to help you:';
    } else {
      fallbackAnswer =
        "I'm experiencing a technical issue. Please visit csuchico.edu " +
        'or call the main campus line at (530) 898-6116 for assistance.';
    }

    const response: ChatResponse = {
      answer: fallbackAnswer,
      sources: [],
      departments: fallbackDepartments,
      workflow: null,
      confidence: 0,
      session_id: sessionId,
      detected_language: 'en',
    };

    res.json(response);
  }
});

export default router;
