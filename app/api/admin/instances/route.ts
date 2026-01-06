import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import adminsData from '@/data/admins.json';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

function isValidAdmin(token: string): boolean {
  return adminsData.admins.some(admin => admin.token === token);
}

function getAdminEmail(token: string): string {
  return adminsData.admins.find(admin => admin.token === token)?.email ?? ""
}

// Load Instances form the file
function loadInstances(): SurveyInstance[] {
  try {
    if (!existsSync(INSTANCES_FILE)) {
      // Create the file if not existing
      writeFileSync(INSTANCES_FILE, JSON.stringify({ instances: [] }, null, 2));
      return [];
    }
    
    const data = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
    return data.instances || [];
  } catch (error) {
    // console.error('Instances loading error:', error);
    return [];
  }
}

// Save instance on files
function saveInstances(instances: SurveyInstance[]) {
  try {
    const data = { instances };
    writeFileSync(INSTANCES_FILE, JSON.stringify(data, null, 2), 'utf8');
    // console.log(`${instances.length} saved instances`);
  } catch (error) {
    // console.error('Save error:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token || !isValidAdmin(token)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const instances = loadInstances();
  return NextResponse.json({ instances });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token || !isValidAdmin(token)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  try {
    const { name, allowedEmails } = await request.json();
    
    // Load current instances
    const instances = loadInstances();
    
    const newInstance: SurveyInstance = {
      id: randomUUID(),
      name,
      token: randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: getAdminEmail(token),
      isActive: true,
      allowedEmails
    };

    // Add new instance
    instances.push(newInstance);
    
    // Save in file
    saveInstances(instances);

    return NextResponse.json({ 
      instance: newInstance,
      surveyUrl: `/survey/${newInstance.token}`,
      message: 'Instance créée et sauvegardée'
    });
    
  } catch (error) {
    // console.error('Creation of instance error:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de la création de l\'instance' 
    }, { status: 500 });
  }
}