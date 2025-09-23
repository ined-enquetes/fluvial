'use client'
import { useState, useEffect } from 'react';
import { Model, ITheme } from "survey-core";
import { Survey } from "survey-react-ui";
import 'survey-core/survey-core.css';
import surveyTheme  from "@/data/survey_theme.json";
import { ResponsesData } from '@/types';

interface SurveyComponentProps {
  token: string;
}

export default function SurveyComponent({ token }: SurveyComponentProps) {
  const [survey, setSurvey] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSurvey();
  }, [token]);

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

  if (loading) return <div className="p-8">Chargement du questionnaire...</div>;
  if (error) return <div className="p-8 text-red-500">Erreur: {error}</div>;
  if (!survey) return <div className="p-8">Questionnaire non disponible</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Survey model={survey} />
    </div>
  );
}