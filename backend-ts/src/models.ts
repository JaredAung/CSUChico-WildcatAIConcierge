export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Source {
  title: string;
  url: string;
  excerpt: string;
  type: 'website' | 'pdf' | 'policy' | 'faq';
}

export interface Department {
  name: string;
  phone: string;
  email: string;
  website: string;
  office: string;
}

export interface WorkflowStep {
  step_number: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  forms: string[];
  department: string;
}

export interface WorkflowCard {
  title: string;
  steps: WorkflowStep[];
  estimated_days: string;
  required_forms: string[];
  responsible_offices: string[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  session_id?: string;
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
  departments: Department[];
  workflow: WorkflowCard | null;
  confidence: number;
  session_id: string;
  detected_language: string;
}
