import { NextRequest, NextResponse } from 'next/server';
import { loadResponses } from '@/lib/saveUtils';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import adminsData from '@/data/admins.json';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {

  const adminToken = request.headers.get('authorization')?.replace('Bearer ', '');

  
  if (!adminToken || !adminsData.admins.some(admin => admin.token === adminToken)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { token } = await params;
  
  try {
    // Load Instances
    const instancesData = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
    const instance = instancesData.instances.find((inst: SurveyInstance) => inst.id === token);
    if (!instance) {
      return NextResponse.json({ error: 'Instance non trouvée' }, { status: 404 });
    }

    const responsesToken = instance.token;


    // Loading responses
    const responsesData = loadResponses(responsesToken);
    
    if (Object.keys(responsesData).length === 0) {
      return NextResponse.json({ error: 'Aucune réponse trouvée' }, { status: 404 });
    }

    return new NextResponse(JSON.stringify(responsesData), {
      headers: {
        'Content-Type': 'text/json; charset=utf-8',
        'Content-Disposition': `attachment"`,
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    // console.error('Erreur export CSV:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de l\'export' 
    }, { status: 500 });
  }
}