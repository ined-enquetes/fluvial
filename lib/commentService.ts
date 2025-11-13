import { Comment, CreateCommentDto } from '@/types';

export class CommentService {
  private baseUrl: string;

  constructor(surveyToken: string) {
    this.baseUrl = `/api/survey/${surveyToken}/comments`;
  }

  async getComments(): Promise<Comment[]> {
    
    const response = await fetch(this.baseUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch comments');
    }
    const data = await response.json();
    return data.comments || [];
  }

  async createComment(dto: CreateCommentDto, author: string): Promise<Comment> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...dto, author }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create comment');
    }
    
    return response.json();
  }

  async deleteComment(commentId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${commentId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete comment');
    }
  }
}
