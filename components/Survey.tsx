'use client'

import { useState, useEffect, useRef } from 'react';
import { Model, ITheme, SurveyModel, Question } from "survey-core";
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
  const [currentUser, setCurrentUser] = useState<string>('');
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  // ---------- refs ----------
  const containerMapRef = useRef<Map<string, { container: HTMLElement; title: string }>>(
    new Map()
  );
  const rootMapRef = useRef<Map<string, ReactDOM.Root>>(new Map());


  const loadComments = async () => {
    try {
      const loadedComments = await commentService.getComments();
      setComments(loadedComments);
      setCommentsLoaded(true);
    } catch (error) {
      console.error('Failed to load comments:', error);
      setCommentsLoaded(true);
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

  const handleAfterRender = (sender: SurveyModel, options: { htmlElement: HTMLElement; question: Question }) => {
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
    // console.log("Mount or update")
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

  
  // Function that is called firstly to generate the surveyJS part
  const loadSurvey = async () => {
    try {
      const response = await fetch(`/api/survey/${token}`);
      if (!response.ok) {
        throw new Error('Questionnaire non trouvé');
      }

      const { surveyJson, existingData } = await response.json();
      const surveyModel = new Model(surveyJson);
      surveyModel.applyTheme(surveyTheme as ITheme);
      
      // Load existing responses
      if (existingData && Object.keys(existingData).length > 0) {
        surveyModel.data = existingData;
      }

      // Autosave when a field has changed
      surveyModel.onValueChanged.add(async (sender, options) => {
        // console.log(`Save: ${options.name} = ${JSON.stringify(options.value)}`);
        
        // Save all survey data
        await saveSurveyData(sender.data);
      });

      // Submit save (optional)
      surveyModel.onComplete.add(async (sender) => {
        await saveSurveyData(sender.data);
      });

      // console.log("Attaching onAfterRenderQuestion Loading the Survey, commentsLoaded=", commentsLoaded);
      // Attach listener right away -> attach empty containers to containerMapRef
      surveyModel.onAfterRenderQuestion.add(handleAfterRender);

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
          surveyData // Save all data of the survey
        })
      });

      if (!response.ok) {
        // console.error('Save error:', response.statusText);
      }
    } catch (error) {
      // console.error('Network save error:', error);
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

  // ---------- Effect that updates on data change ----------
  useEffect(() => {
    if (!commentsLoaded) return;
    // console.log('🔄 Re-render triggered! Comments count:', comments.length);
    // console.log('🔄 Re-render triggered! mapref count:', containerMapRef.current);

    // Fill containerMapRef with comments whenever loaded comments or user change
    containerMapRef.current.forEach((_info, qName) => {
      mountOrUpdate(qName);
    });
  }, [comments, currentUser, commentsLoaded]);


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