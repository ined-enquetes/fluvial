'use client'

import { useState, useEffect, useRef } from 'react';
import { Model, ITheme, SurveyModel, Question } from "survey-core";
import { Survey } from "survey-react-ui";

import { CommentService } from '@/lib/commentService';
import { getUserNameFromCookie } from '@/lib/cookiesUtils';
import { getQuestionId } from '@/lib/questionId';

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
  // One entry per *rendered* question element (not per question name): inside a
  // repeated section (paneldynamic / "Add new") every row renders questions with
  // the same name, so the element is the only stable unique key.
  const targetMapRef = useRef<
    Map<HTMLElement, { question: Question; sharedQuestionId: string; title: string; container: HTMLElement }>
  >(new Map());
  const rootMapRef = useRef<Map<HTMLElement, ReactDOM.Root>>(new Map());

  // Latest values, readable from the SurveyJS event handlers, which are
  // registered once and would otherwise keep a stale closure.
  const latestRef = useRef({ comments, currentUser });
  latestRef.current = { comments, currentUser };

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
    const author = latestRef.current.currentUser;
    if (!author) return;
    
    const newComment = await commentService.createComment(
      { questionId, text },
      author
    );
    setComments(prev => [...prev, newComment]);
  };

  const handleDeleteComment = async (commentId: string) => {
    await commentService.deleteComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const createContainer = (questionElement: HTMLElement) => {
    const container = document.createElement('div');
    container.className = 'comment-thread-container';
    container.style.position = 'absolute';
    container.style.right = '-20px';
    container.style.top = '0';
    container.style.zIndex = '1';

    questionElement.style.position = 'relative';
    questionElement.appendChild(container);
    return container;
  };

  // ---------- (re)mount or update ---------- //
  const mountOrUpdate = (questionElement: HTMLElement) => {
    const target = targetMapRef.current.get(questionElement);
    if (!target) return; // should never happen

    const { container, question, sharedQuestionId, title } = target;
    const { comments: currentComments, currentUser: currentUserName } = latestRef.current;

    // Recomputed on every render: a row that moved (entry removed above it)
    // must follow its new position
    const questionId = getQuestionId(question);

    // Get existing root or create a new one
    let root = rootMapRef.current.get(container);
    if (!root) {
      root = ReactDOM.createRoot(container);
      rootMapRef.current.set(container, root);
    }

    // Render the CommentThread with the latest props
    root.render(
      <CommentThread
        questionId={questionId}
        sharedQuestionId={sharedQuestionId}
        questionTitle={title}
        comments={currentComments}
        currentUser={currentUserName}
        onAddComment={handleAddComment}
        onDeleteComment={handleDeleteComment}
      />
    );
  };

  // React refuses to unmount a root while it is still rendering (this cleanup
  // runs from an effect of the page), hence the deferred call.
  const disposeRoot = (root: ReactDOM.Root | undefined) => {
    if (!root) return;
    setTimeout(() => root.unmount(), 0);
  };

  const unmountThread = (questionElement: HTMLElement) => {
    const target = targetMapRef.current.get(questionElement);
    if (!target) return;

    const root = rootMapRef.current.get(target.container);
    rootMapRef.current.delete(target.container);
    target.container.remove();
    targetMapRef.current.delete(questionElement);
    disposeRoot(root);
  };

  // Called on every comments / user change: drop the rows that were removed
  // from the form and refresh every remaining thread.
  const syncThreads = () => {
    targetMapRef.current.forEach((target, questionElement) => {
      if (!questionElement.isConnected) {
        // Row deleted (or its element replaced by React)
        unmountThread(questionElement);
        return;
      }
      if (!questionElement.contains(target.container)) {
        // Container lost during a re-render: drop the stale root and rebuild it
        const staleRoot = rootMapRef.current.get(target.container);
        if (staleRoot) {
          rootMapRef.current.delete(target.container);
          disposeRoot(staleRoot);
        }
        target.container = createContainer(questionElement);
      }
      mountOrUpdate(questionElement);
    });
  };

  const handleAfterRender = (sender: SurveyModel, options: { htmlElement: HTMLElement; question: Question }) => {
    const questionElement = options.htmlElement;
    const question = options.question;

    // Already handled (this exact element already has a thread)
    if (targetMapRef.current.has(questionElement)) return;

    // Create the container component
    const existing = questionElement.querySelector<HTMLElement>('.comment-thread-container');
    const container = existing ?? createContainer(questionElement);

    // Store where to mount
    targetMapRef.current.set(questionElement, {
      container,
      question,
      // Comments saved before per-entry ids: a single thread for the field
      // itself, shared by every row of the section
      sharedQuestionId: question.name,
      title: question.title || question.name,
    });

    // Mount straight away: rows added with "Add new" have no state change to
    // wait for
    mountOrUpdate(questionElement);
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
      // Attach listener right away -> one thread container per rendered question
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

    syncThreads();
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