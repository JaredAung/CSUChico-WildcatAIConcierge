import { Router, Request, Response } from 'express';
import { Department } from '../models';

const router = Router();

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const SUGGESTED_QUESTIONS: string[] = [
  'How do I apply for financial aid at CSU Chico?',
  'Where is the Accessibility Resource Center and how do I get accommodations?',
  'How do I register for classes and what are the priority registration dates?',
  'How do I purchase a parking permit for the semester?',
  'What on-campus housing options are available and how do I apply?',
  'How do I rent a campus facility or reserve a venue for an event?',
  'Where is Student Health Services and how do I make an appointment?',
  'What steps do I need to follow to register a campus event?',
];

export const DEPARTMENTS: Department[] = [
  {
    name: 'Admissions Office',
    phone: '(530) 898-4428',
    email: 'info@csuchico.edu',
    website: 'https://www.csuchico.edu/admissions/',
    office: 'Kendall Hall 110',
  },
  {
    name: 'Financial Aid Office',
    phone: '(530) 898-6451',
    email: 'finaid@csuchico.edu',
    website: 'https://www.csuchico.edu/fa/',
    office: 'Student Services Center 250',
  },
  {
    name: 'Office of the Registrar',
    phone: '(530) 898-5142',
    email: 'registrar@csuchico.edu',
    website: 'https://www.csuchico.edu/registrar/',
    office: 'Kendall Hall 220',
  },
  {
    name: 'Accessibility Resource Center (ARC)',
    phone: '(530) 898-5959',
    email: 'arc@csuchico.edu',
    website: 'https://www.csuchico.edu/arc/',
    office: 'Student Services Center 170',
  },
  {
    name: 'Student Health Services',
    phone: '(530) 898-6452',
    email: 'shs@csuchico.edu',
    website: 'https://www.csuchico.edu/shs/',
    office: 'Student Services Center 190',
  },
  {
    name: 'Housing & Residence Life',
    phone: '(530) 898-6204',
    email: 'housing@csuchico.edu',
    website: 'https://www.csuchico.edu/housing/',
    office: 'BMU Room 101',
  },
  {
    name: 'University Parking Services',
    phone: '(530) 898-5475',
    email: 'parking@csuchico.edu',
    website: 'https://www.csuchico.edu/parking/',
    office: 'BMU Room 120',
  },
  {
    name: 'University Events & Conference Services',
    phone: '(530) 898-6811',
    email: 'events@csuchico.edu',
    website: 'https://www.csuchico.edu/events/',
    office: 'Kendall Hall 220',
  },
  {
    name: 'Student Life & Leadership',
    phone: '(530) 898-6823',
    email: 'sll@csuchico.edu',
    website: 'https://www.csuchico.edu/sll/',
    office: 'BMU Room 220',
  },
  {
    name: 'Meriam Library',
    phone: '(530) 898-6501',
    email: 'library@csuchico.edu',
    website: 'https://www.csuchico.edu/library/',
    office: 'Meriam Library Building',
  },
  {
    name: 'Information Technology (ITSS)',
    phone: '(530) 898-4357',
    email: 'itss@csuchico.edu',
    website: 'https://www.csuchico.edu/itss/',
    office: 'Langdon Hall 119',
  },
  {
    name: 'Risk Management & Insurance',
    phone: '(530) 898-4321',
    email: 'riskmanagement@csuchico.edu',
    website: 'https://www.csuchico.edu/riskmanagement/',
    office: 'Kendall Hall 308',
  },
  {
    name: 'Environmental Health & Safety',
    phone: '(530) 898-5826',
    email: 'ehs@csuchico.edu',
    website: 'https://www.csuchico.edu/ehs/',
    office: 'Kendall Hall 110B',
  },
  {
    name: 'Career Center',
    phone: '(530) 898-5253',
    email: 'career@csuchico.edu',
    website: 'https://www.csuchico.edu/careers/',
    office: 'Student Services Center 260',
  },
  {
    name: 'Associated Students (AS)',
    phone: '(530) 898-6823',
    email: 'as@csuchico.edu',
    website: 'https://www.csuchico.edu/as/',
    office: 'BMU Room 220',
  },
];

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

router.get('/suggested-questions', (_req: Request, res: Response) => {
  res.json({ questions: SUGGESTED_QUESTIONS });
});

router.get('/departments', (_req: Request, res: Response) => {
  res.json({ departments: DEPARTMENTS });
});

export default router;
