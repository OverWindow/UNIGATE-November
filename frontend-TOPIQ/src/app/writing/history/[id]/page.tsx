import WritingHistory from "@/components/writing/WritingHistory";

export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WritingHistory key={id} id={id} />;
}
