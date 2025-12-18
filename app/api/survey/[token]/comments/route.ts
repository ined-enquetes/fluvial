import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Comment, SurveyComments } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data', 'responses');

// Ensure directory exists
async function ensureDataDir(token: string) {
  try {
    await fs.mkdir(`${DATA_DIR}/${token}`, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

function getCommentsFilePath(token: string): string {
  return path.join(DATA_DIR, `${token}/comments.json`);
}

// Read comments from file
async function readComments(token: string): Promise<SurveyComments> {
  const filePath = getCommentsFilePath(token);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file don't exist, return empty
    return {
      surveyInstanceId: token,
      comments: [],
    };
  }
}

// Write comment from path
async function writeComments(token: string, data: SurveyComments): Promise<void> {
  await ensureDataDir(token);
  const filePath = getCommentsFilePath(token);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// GET - Get all comments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const data = await readComments(token);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading comments:', error);
    return NextResponse.json(
      { error: 'Failed to read comments' },
      { status: 500 }
    );
  }
}

// POST - Create new comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { questionId, text, author } = body;
    
    // Validation
    if (!questionId || !text || !author) {
      return NextResponse.json(
        { error: 'Missing required fields: questionId, text, author' },
        { status: 400 }
      );
    }
    
    const data = await readComments(token);
    
    // New comment
    const newComment: Comment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      questionId,
      author,
      text,
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    
    data.comments.push(newComment);
    
    await writeComments(token, data);
    
    return NextResponse.json(newComment, { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
