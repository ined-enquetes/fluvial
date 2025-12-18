import { NextRequest, NextResponse } from 'next/server';
import { saveTokenResponse, loadResponses } from '@/lib/saveUtils';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

function findInstance(token: string) {
  try {
    if (!existsSync(INSTANCES_FILE)) return null;
    const data = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
    return data.instances.find((inst: SurveyInstance) => inst.token === token);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token, surveyData } = await request.json();
    
    // Verify that instance exists
    const instance = findInstance(token);
    if (!instance) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 404 });
    }

    // Save data 
    saveTokenResponse(token, surveyData);

    return NextResponse.json({ 
      message: 'Réponses sauvegardées',
      saved: true,
      token: token
    });

  } catch (error) {
    // console.error('Saving error:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de la sauvegarde' 
    }, { status: 500 });
  }
}