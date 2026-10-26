export interface SurveyInstance {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  createdBy: string;
  isActive: boolean;
  responseData?: ResponsesData;
  allowedEmails?: string[]; // Optionnel: restreindre l'accès
}

export interface ResponsesData {
   // token -> data
}

// History of changes made to the answers of a questionnaire
export type HistorySource = 'survey' | 'import';

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  updatedAt?: string;
  author: string;
  source: HistorySource;
  changes: FieldChange[];
}

export interface SurveyTemplate {
  version: string;
  updatedAt: string;
  surveyJson: any; // Configuration SurveyJS
}

export interface Admin {
  email: string;
  token: string;
}

// Comments
export interface Comment {
  id: string;
  questionId: string;
  author: string;
  text: string;
  timestamp: string;
  resolved: boolean;
}

export interface SurveyComments {
  surveyInstanceId: string;
  comments: Comment[];
}

export interface CreateCommentDto {
  questionId: string;
  text: string;
}

export interface UpdateCommentDto {
  text?: string;
  resolved?: boolean;
}
