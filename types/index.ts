export interface SurveyInstance {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  createdBy: string;
  isActive: boolean;
  allowedEmails?: string[]; // Optionnel: restreindre l'accès
}

export interface ResponsesData {
   // token -> data
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

export interface SurveyInstance {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  createdBy: string;
  isActive: boolean;
  allowedEmails?: string[]; // Optionnel: restreindre l'accès
}

export interface ResponsesData {
   // token -> data
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
