import type { Language } from "@/lib/landing-content";
import type { WritingQuestion } from "@/lib/writing-api";
import { writingContent } from "@/lib/writing-content";
import WritingMaterial from "./WritingMaterial";

export default function WritingQuestionContent({ question, language }: { question: WritingQuestion; language: Language }) {
  const t = writingContent[language];
  return <div lang="ko">
    <p className="writing-instruction">{question.instruction}</p>
    {question.passage && <div className="writing-passage">
      {question.contextTitle && <h3>{question.contextTitle}</h3>}
      <p>{question.passage}</p>
    </div>}
    {question.number === 53 && question.imageUrl
      ? <img className="writing-material-image" src={question.imageUrl} alt={`${question.topic} 자료`} />
      : question.materials.length > 0 && <div className="writing-materials">{question.materials.map((material, position) =>
        <WritingMaterial key={`${question.number}-${position}`} material={material} language={language} />)}</div>}
    {question.materialNotes.length > 0 && <ul className="writing-notes">{question.materialNotes.map((note, position) => <li key={position}>{note}</li>)}</ul>}
    {question.dataSource && <p className="writing-source"><span lang={language}>{t.source}: </span>{question.dataSource}</p>}
    {question.requirements.length > 0 && <ul className="writing-requirements">{question.requirements.map((requirement, position) => <li key={position}>{requirement}</li>)}</ul>}
  </div>;
}
