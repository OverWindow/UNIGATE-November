import PbtAttempt from "@/components/pbt/PbtAttempt";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PbtAttempt id={id} examFormat="ibt" />;
}
