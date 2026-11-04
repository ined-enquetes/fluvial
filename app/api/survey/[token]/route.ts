import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadResponses } from '@/lib/saveUtils';
import { loadQuestionnaireJson } from '@/lib/questionnaires';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

function loadInstances() {
  try {
    if (!existsSync(INSTANCES_FILE)) return [];
    const data = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
    return data.instances || [];
  } catch {
    return [];
  }
}


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  
  const instances = loadInstances();
  const instance = instances.find((inst: SurveyInstance) => inst.token === token);
  
  if (!instance || !instance.isActive) {
    return NextResponse.json({ error: 'Instance non trouvée' }, { status: 404 });
  }

  // Get responses for this token
  const responsesData = loadResponses(token);
  const existingData = responsesData || {};

  return NextResponse.json({
    instance: {
      id: instance.id,
      name: instance.name,
      questionnaire: instance.questionnaire
    },
    surveyJson: loadQuestionnaireJson(instance.questionnaire),
    existingData: existingData
  });
}