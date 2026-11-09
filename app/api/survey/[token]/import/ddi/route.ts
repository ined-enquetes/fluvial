import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import adminsData from '@/data/admins.json';
import { DdiImportError, importDdiCodebook } from '@/lib/ddiImport';
import { loadResponses, saveResponses } from '@/lib/saveUtils';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

function isValidAdmin(token: string): boolean {
  return adminsData.admins.some((admin) => admin.token === token);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const adminToken = request.headers
    .get('authorization')
    ?.replace('Bearer ', '');

  if (!adminToken || !isValidAdmin(adminToken)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { token } = await params;

  try {
    const instancesData = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
    const instance = instancesData.instances.find(
      (inst: SurveyInstance) => inst.id === token
    );

    if (!instance) {
      return NextResponse.json(
        { error: 'Instance non trouvée' },
        { status: 404 }
      );
    }

    const xml = await request.text();

    if (!xml.trim()) {
      return NextResponse.json(
        { error: 'Le fichier DDI est vide' },
        { status: 400 }
      );
    }

    const imported = importDdiCodebook(xml);

    // `logoFile` is an application asset stored as an uploaded file; it cannot
    // be reconstructed from a DDI document, so keep the current value.
    const current = loadResponses(instance.token) as Record<string, unknown>;
    const logoFile = current.logoFile;

    const data: Record<string, unknown> = { ...imported.data };

    if (logoFile !== undefined) {
      data.logoFile = logoFile;
    }

    saveResponses(
      data as Record<string, never>,
      instance.token
    );

    return NextResponse.json({
      message: `Métadonnées DDI ${imported.version} importées.`,
      version: imported.version,
      fields: Object.keys(data).length,
      warnings: imported.warnings,
    });
  } catch (error) {
    if (error instanceof DdiImportError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Erreur lors de l'import DDI" },
      { status: 500 }
    );
  }
}
