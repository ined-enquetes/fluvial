import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ResponsesData } from '@/types';

const RESPONSES_FILE = join(process.cwd(), 'data/responses/');

function ensureDataDirectory(folder : string) {
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
}

export function loadResponses(token: string): ResponsesData {
  const folder = RESPONSES_FILE + token;
  const FILE = folder + '/responses.json'
  
  try {
    ensureDataDirectory(folder);
    
    if (!existsSync(FILE)) {
      const initialData: ResponsesData = {};
      writeFileSync(FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    
    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    return data;
  } catch (error) {
    // console.error('Loading save error:', error);
    return {};
  }
}

export function saveResponses(responsesData: Record<string, ResponsesData>, token: string): void {
  const folder = join(RESPONSES_FILE, token);
  const FILE = join(folder, '/responses.json')
  try {
    ensureDataDirectory(folder);
    writeFileSync(FILE, JSON.stringify(responsesData, null, 2), 'utf8');
    // console.log(`Save responses for ${Object.keys(responsesData.responses).length} tokens`);
  } catch (error) {
    // console.error('Save responses error:', error);
    throw error;
  }
}

export function saveTokenResponse(token: string, surveyData: Record<string, ResponsesData>): void {
  try {
    saveResponses(surveyData, token);
  } catch (error) {
    // console.error('Save token error:', error);
    throw error;
  }
}