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