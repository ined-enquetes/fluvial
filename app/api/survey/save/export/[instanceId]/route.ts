import { NextRequest, NextResponse } from 'next/server';
import { loadResponses } from '@/lib/saveUtils';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import adminsData from '@/data/admins.json';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token || !adminsData.admins.some(admin => admin.token === token)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { instanceId } = await params;
  
  try {
    // Charger les instances
    const instancesData = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
    const instance = instancesData.instances.find((inst: any) => inst.id === instanceId);
    
    if (!instance) {
      return NextResponse.json({ error: 'Instance non trouvée' }, { status: 404 });
    }

    // Charger toutes les réponses
    const responsesData = loadResponses();
    
    // Trouver tous les tokens de cette instance (même instance peut avoir plusieurs tokens)
    const instanceTokens = instancesData.instances
      .filter((inst: any) => inst.id === instanceId)
      .map((inst: any) => inst.token);

    // Récupérer les réponses pour cette instance
    const instanceResponses = Object.entries(responsesData.responses)
      .filter(([token]) => instanceTokens.includes(token))
      .map(([token, data]) => ({ token, ...data }));
    
    if (instanceResponses.length === 0) {
      return NextResponse.json({ error: 'Aucune réponse trouvée' }, { status: 404 });
    }

    // Générer le CSV
    const allKeys = new Set<string>();
    instanceResponses.forEach(response => {
      Object.keys(response).forEach(key => {
        if (key !== 'token') allKeys.add(key);
      });
    });

    const headers = ['token', ...Array.from(allKeys)];
    
    const csvRows = [
      headers.join(','),
      ...instanceResponses.map(response => {
        const row = [
          response.token,
          ...Array.from(allKeys).map(key => {
            const value = response[key as keyof typeof response];
            if (Array.isArray(value)) {
              return `"${value.join('; ')}"`;
            }
            return JSON.stringify(value || '').replace(/"/g, '""');
          })
        ];
        return row.join(',');
      })
    ];

    const csvContent = csvRows.join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${instance.name}-responses.csv"`
      }
    });

  } catch (error) {
    // console.error('Erreur export CSV:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de l\'export' 
    }, { status: 500 });
  }
}