import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import adminsData from '@/data/admins.json';
import { DdiVersion, generateDdiCodebook } from '@/lib/ddi';
import { loadResponses } from '@/lib/saveUtils';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

const SUPPORTED_VERSIONS: DdiVersion[] = ['2.6', '2.5', '2.1'];

function isDdiVersion(value: string | null): value is DdiVersion {
  return value !== null && SUPPORTED_VERSIONS.includes(value as DdiVersion);
}

/** Build a safe ASCII-ish file name for the download. */
function buildFileName(instanceName: string, version: DdiVersion): string {
  const base = instanceName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${base || 'etude'}-ddi-${version}.xml`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const adminToken = request.headers
    .get('authorization')
    ?.replace('Bearer ', '');

  if (
    !adminToken ||
    !adminsData.admins.some((admin) => admin.token === adminToken)
  ) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const requestedVersion = request.nextUrl.searchParams.get('version');
  const version: DdiVersion = isDdiVersion(requestedVersion)
    ? requestedVersion
    : '2.6';

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

    const responsesData = loadResponses(instance.token);

    if (Object.keys(responsesData).length === 0) {
      return NextResponse.json(
        { error: 'Aucune réponse trouvée' },
        { status: 404 }
      );
    }

    const xml = generateDdiCodebook(
      responsesData as Record<string, unknown>,
      { version, fallbackTitle: instance.name }
    );

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildFileName(
          instance.name,
          version
        )}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de l'export DDI" },
      { status: 500 }
    );
  }
}
