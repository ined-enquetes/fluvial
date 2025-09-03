import SurveyComponent from '@/components/Survey';

export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SurveyComponent token={token} />;
}