import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import adminsData from '@/data/admins.json';
import templateData from '@/data/survey-template.json';
import { loadHistory } from '@/lib/saveUtils';
import { SurveyInstance } from '@/types';

const INSTANCES_FILE = join(process.cwd(), 'data/instances.json');

function isValidAdmin(token: string): boolean {
  return adminsData.admins.some(admin => admin.token === token);
}

function collectQuestionTitles(node: unknown, titles: Record<string, string>) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) {
      collectQuestionTitles(child, titles);
    }
    return;
  }

  const record = node as Record<string, unknown>;

  if (typeof record.name === 'string' && typeof record.title === 'string') {
    titles[record.name] = record.title;
  }

  for (const key of ['pages', 'elements', 'templateElements', 'questions', 'columns']) {
    collectQuestionTitles(record[key], titles);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token || !isValidAdmin(token)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { id } = await params;

  try {
    if (!existsSync(INSTANCES_FILE)) {
      return NextResponse.json({ error: 'Instance introuvable' }, { status: 404 });
    }

    const instancesData = JSON.parse(readFileSync(INSTANCES_FILE, 'utf8'));
    const instance = instancesData.instances?.find(
      (item: SurveyInstance) => item.id === id
    );

    if (!instance) {
      return NextResponse.json({ error: 'Instance introuvable' }, { status: 404 });
    }

    const questionTitles: Record<string, string> = {};
    collectQuestionTitles(templateData, questionTitles);

    const history = loadHistory(instance.token)
      .sort((a, b) =>
        (b.updatedAt ?? b.timestamp).localeCompare(a.updatedAt ?? a.timestamp)
      );

    return NextResponse.json({
      instance: {
        id: instance.id,
        name: instance.name,
      },
      questionTitles,
      history,
    });
  } catch (error) {
    console.error('Loading history error:', error);
    return NextResponse.json(
      { error: "Erreur lors du chargement de l'historique" },
      { status: 500 }
    );
  }
}
