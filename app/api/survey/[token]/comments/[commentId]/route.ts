import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { SurveyComments } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data', 'responses');

function getCommentsFilePath(token: string): string {
  return path.join(DATA_DIR, token, `comments.json`);
}

async function readComments(token: string): Promise<SurveyComments> {
  const filePath = getCommentsFilePath(token);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {
      surveyInstanceId: token,
      comments: [],
    };
  }
}

async function writeComments(token: string, data: SurveyComments): Promise<void> {
  const filePath = getCommentsFilePath(token);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// DELETE - Supprimer un commentaire
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; commentId: string }> }
) {
  try {
    const { token, commentId } = await params;
    
    // Lire les commentaires existants
    const data = await readComments(token);
    
    // Trouver le commentaire à supprimer
    const commentIndex = data.comments.findIndex(c => c.id === commentId);
    
    if (commentIndex === -1) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }
    
    // Supprimer le commentaire
    data.comments.splice(commentIndex, 1);
    
    // Sauvegarder
    await writeComments(token, data);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
