import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ResponsesData } from '@/types';

const RESPONSES_FILE = join(process.cwd(), 'data/responses.json');

function ensureDataDirectory() {
  const dirPath = join(process.cwd(), 'data');
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function loadResponses(): ResponsesData {
  try {
    ensureDataDirectory();
    
    if (!existsSync(RESPONSES_FILE)) {
      const initialData: ResponsesData = { responses: {} };
      writeFileSync(RESPONSES_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    
    const data = JSON.parse(readFileSync(RESPONSES_FILE, 'utf8'));
    return data;
  } catch (error) {
    // console.error('Erreur chargement réponses:', error);
    return { responses: {} };
  }
}

export function saveResponses(responsesData: ResponsesData): void {
  try {
    //ensureDataDirectory();
    writeFileSync(RESPONSES_FILE, JSON.stringify(responsesData, null, 2), 'utf8');
    // console.log(`💾 Réponses sauvegardées pour ${Object.keys(responsesData.responses).length} tokens`);
  } catch (error) {
    // console.error('❌ Erreur sauvegarde réponses:', error);
    throw error;
  }
}

export function saveTokenResponse(token: string, surveyData: Record<string, any>): void {
  try {
    const responsesData = loadResponses();
    responsesData.responses[token] = surveyData;
    saveResponses(responsesData);
  } catch (error) {
    // console.error('❌ Erreur sauvegarde token:', error);
    throw error;
  }
}