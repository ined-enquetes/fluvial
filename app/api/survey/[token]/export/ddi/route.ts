import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import adminsData from '@/data/admins.json';
import { generateDdiCodebook } from '@/lib/ddi';
import type {
  DdiExportVersion,
  DdiLifecycleVersion,
} from '@/lib/ddiXml';
import { generateDdiLifecycle33 } from '@/lib/ddiLifecycle33';
import { generateDdiLifecycle40 } from '@/lib/ddiLifecycle40';
import { lifecycleVersionConfig } from '@/lib/ddiLifecycleMapping';
import { loadResponses } from '@/lib/saveUtils';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

const SUPPORTED_VERSIONS: DdiExportVersion[] = [
  '2.6',
  '2.5',
  '2.1',
  '3.3',
  '4.0',
];

function isDdiVersion(value: string | null): value is DdiExportVersion {
  return (
    value !== null &&
    SUPPORTED_VERSIONS.includes(value as DdiExportVersion)
  );
}

function isLifecycleVersion(
  version: DdiExportVersion
): version is DdiLifecycleVersion {
  return version === '3.3' || version === '4.0';
}

/** Build a safe ASCII-ish file name for the download. */
function buildFileName(
  instanceName: string,
  version: DdiExportVersion
): string {
  const base = instanceName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  const extension = isLifecycleVersion(version)
    ? lifecycleVersionConfig(version).extension
    : 'xml';

  return `${base || 'etude'}-ddi-${version}.${extension}`;
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
  const version: DdiExportVersion = isDdiVersion(requestedVersion)
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

    const responses = responsesData as Record<string, unknown>;
    const options = { fallbackTitle: instance.name };

    const content =
      version === '3.3'
        ? generateDdiLifecycle33(responses, options)
        : version === '4.0'
          ? generateDdiLifecycle40(responses, options)
          : generateDdiCodebook(responses, { version, ...options });

    const mediaType = isLifecycleVersion(version)
      ? lifecycleVersionConfig(version).mediaType
      : 'application/xml';

    return new NextResponse(content, {
      headers: {
        'Content-Type': `${mediaType}; charset=utf-8`,
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
