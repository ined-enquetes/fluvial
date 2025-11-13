'use client'

import { useState, useEffect, useRef } from 'react';
import { Model, ITheme } from "survey-core";
import { Survey } from "survey-react-ui";

import { CommentService } from '@/lib/commentService';
import { getUserNameFromCookie } from '@/lib/cookiesUtils';

import ReactDOM from 'react-dom/client';
import 'survey-core/survey-core.css';
import surveyTheme  from "@/data/survey_theme.json";

import { ResponsesData, Comment } from '@/types';

import UserHeader from './UserHeader';
import CommentThread from './CommentThread';


interface SurveyComponentProps {
  token: string;
}

export default function SurveyComponent({ token }: SurveyComponentProps) {
  const [survey, setSurvey] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentService] = useState(() => new CommentService(token));
  const [comments, setComments] = useState<Comment[]>([]);
  const commentRootsRef = useRef<Map<string, ReactDOM.Root>>(new Map());
  const handleAddCommentRef = useRef<(questionId: string, text: string) => Promise<void>>();
  const handleDeleteCommentRef = useRef<(commentId: string) => Promise<void>>();
  const [currentUser, setCurrentUser] = useState<string>('');

  // ---------- refs ----------
  const containerMapRef = useRef<Map<string, { container: HTMLElement; title: string }>>(
    new Map()
  );
  const rootMapRef = useRef<Map<string, ReactDOM.Root>>(new Map());


  const loadComments = async () => {
    try {
      const loadedComments = await commentService.getComments();
      setComments(loadedComments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };
  
  const handleAddComment = async (questionId: string, text: string) => {
    if (!currentUser) return;
    
    const newComment = await commentService.createComment(
      { questionId, text },
      currentUser
    );
    setComments(prev => [...prev, newComment]);
  };

  const handleDeleteComment = async (commentId: string) => {
    await commentService.deleteComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const handleAfterRender = (sender: any, options: any) => {
    const questionElement = options.htmlElement;
    const question = options.question;
    const questionName = question.name;
    const questionTitle = question.title || questionName;

    // Avoid duplicate containers
    if (questionElement.querySelector('.comment-thread-container')) return;

    // Create the contaier component
    const container = document.createElement('div');
    container.className = 'comment-thread-container';
    container.style.position = 'absolute';
    container.style.right = '-20px';
    container.style.top = '0';
    
    questionElement.style.position = 'relative';
    questionElement.appendChild(container);

    // Store where to mount later
    containerMapRef.current.set(questionName, { container, title: questionTitle });
  };

  // ---------- (re)mount or update ---------- //
  const mountOrUpdate = (questionName: string) => {
    const info = containerMapRef.current.get(questionName);
    if (!info) return; // should never happen

    const { container, title } = info;

    // Get existing root or create a new one
    let root = rootMapRef.current.get(questionName);
    if (!root) {
      root = ReactDOM.createRoot(container);
      rootMapRef.current.set(questionName, root);
    }

    // Render the CommentThread with the latest props
    root.render(
      <CommentThread
        questionId={questionName}
        questionTitle={title}
        comments={comments}
        currentUser={currentUser}
        onAddComment={handleAddComment}
        onDeleteComment={handleDeleteComment}
      />
    );
  };

  
  const loadSurvey = async () => {
    try {
      const response = await fetch(`/api/survey/${token}`);
      if (!response.ok) {
        throw new Error('Questionnaire non trouvé');
      }

      const { surveyJson, existingData } = await response.json();
      
      const surveyModel = new Model(surveyJson);
      surveyModel.applyTheme(surveyTheme as ITheme);
      
      // Charger les réponses existantes
      if (existingData && Object.keys(existingData).length > 0) {
        surveyModel.data = existingData;
      }

      // Sauvegarde automatique à chaque changement de valeur
      surveyModel.onValueChanged.add(async (sender, options) => {
        // console.log(`💾 Sauvegarde: ${options.name} = ${JSON.stringify(options.value)}`);
        
        // Sauvegarder toutes les données du survey
        await saveSurveyData(sender.data);
      });

      // Sauvegarde finale au submit (optionnel)
      surveyModel.onComplete.add(async (sender) => {
        await saveSurveyData(sender.data);
      });

      setSurvey(surveyModel);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setLoading(false);
    }
  };

  const saveSurveyData = async (surveyData: ResponsesData) => {
    try {
      const response = await fetch('/api/survey/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          surveyData // Envoyer toutes les données du survey
        })
      });

      if (!response.ok) {
        // console.error('Erreur sauvegarde:', response.statusText);
      }
    } catch (error) {
      // console.error('Erreur réseau sauvegarde:', error);
    }
  };

  // Charger, charger
  useEffect(() => {
    const name = getUserNameFromCookie();
    if (name) {
      setCurrentUser(name);
    }
  }, []);


  useEffect(() => {
    loadSurvey();
    loadComments()
  }, [token]);

  useEffect(() => {
   
    survey?.onAfterRenderQuestion.add(handleAfterRender);

    return () => {
      survey?.onAfterRenderQuestion.remove(handleAfterRender);
    };

    
  }, [comments, survey, currentUser]);

  // ---------- Effect that updates on data change ----------
  useEffect(() => {
    console.log('🔄 Re-render triggered! Comments count:', comments.length);
    // Re‑render every stored question whenever comments or user change
    containerMapRef.current.forEach((_info, qName) => {
      mountOrUpdate(qName);
    });
  }, [comments, currentUser]);

  // ---------- Cleanup ----------
  useEffect(() => {
    return () => {
      // Unmount all React roots
      rootMapRef.current.forEach((root) => root.unmount?.());
      rootMapRef.current.clear();
      containerMapRef.current.clear();
    };
  }, []);

  


  if (loading) return <div className="p-8">Chargement du questionnaire...</div>;
  if (error) return <div className="p-8 text-red-500">Erreur: {error}</div>;
  if (!survey) return <div className="p-8">Questionnaire non disponible</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <UserHeader onUserNameChange={setCurrentUser} />
      <Survey model={survey} />
    </div>
  );
}