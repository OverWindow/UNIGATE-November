import { useId } from "react";
import type { Language } from "@/lib/landing-content";
import type { WritingMaterial as Material } from "@/lib/writing/writing-api";
import { writingContent } from "@/lib/writing/writing-content";

const colors = ["#3866bf", "#c16635", "#248276", "#8a54a5"];
const format = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

export default function WritingMaterial({ material, language }: { material: Material; language: Language }) {
  const titleId = useId();
  const t = writingContent[language];
  const seriesList = material.series ?? [];
  const categories = material.categories ?? [];
  if (material.kind === "table") return <figure className="writing-material" aria-labelledby={titleId}>
    <figcaption id={titleId}>{material.title}</figcaption>
    {material.unit && <p className="writing-unit">{t.unit}: {material.unit}</p>}
    <div className="writing-data writing-table-scroll" tabIndex={0} role="region" aria-label={material.title}><table>
      <thead><tr>{material.columns?.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
      <tbody>{material.rows?.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
  </figure>;
  const values = seriesList.flatMap(series => series.values);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const width = Math.max(600, categories.length * 140);
  const left = 70, right = width - 28, top = 30, bottom = 225;
  const step = (right - left) / categories.length;
  const x = (index: number) => left + step * (index + 0.5);
  const y = (value: number) => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);
  const barWidth = Math.min(48, step * 0.7 / seriesList.length);

  return <figure className="writing-material" aria-labelledby={titleId}>
    <figcaption id={titleId}>{material.title}</figcaption>
    {material.unit && <p className="writing-unit"><span lang={language}>{t.unit}: </span>{material.unit}</p>}
    <div className="writing-chart-scroll" tabIndex={0} role="region" aria-label={material.title}>
      <svg className="writing-chart" viewBox={`0 0 ${width} 285`} role="img" aria-labelledby={`${titleId}-chart`}>
        <title id={`${titleId}-chart`}>{material.title}{material.unit ? ` (${material.unit})` : ""}</title>
        {Array.from({ length: 5 }, (_, index) => {
          const value = minimum + (maximum - minimum) * index / 4;
          return <g key={index}>
            <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#dfe5ef" />
            <text x={left - 10} y={y(value) + 4} textAnchor="end" className="writing-axis-label">{format.format(value)}</text>
          </g>;
        })}
        <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#91a0b6" />
        {categories.map((label, index) => <text key={index} x={x(index)} y={bottom + 30} textAnchor="middle" className="writing-axis-label">{label}</text>)}
        {seriesList.map((series, seriesIndex) => {
          const color = colors[seriesIndex % colors.length];
          return <g key={seriesIndex}>
            {material.kind === "line" && <polyline fill="none" stroke={color} strokeWidth={3}
              strokeDasharray={seriesIndex % 2 ? "7 4" : undefined} points={series.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} />}
            {series.values.map((value, index) => {
              const center = material.kind === "bar" ? x(index) + (seriesIndex - (seriesList.length - 1) / 2) * barWidth : x(index);
              return <g key={index}>
                <title>{categories[index]} · {series.label}: {value}{material.unit}</title>
                {material.kind === "bar"
                  ? <rect x={center - barWidth * 0.4} y={Math.min(y(0), y(value))} width={barWidth * 0.8} height={Math.abs(y(0) - y(value))} rx={3} fill={color} />
                  : <circle cx={center} cy={y(value)} r={5} fill={color} stroke="white" strokeWidth={2} />}
                <text x={center} y={y(value) + (value < 0 ? 18 : -10)} textAnchor="middle" className="writing-value-label">{format.format(value)}</text>
              </g>;
            })}
          </g>;
        })}
      </svg>
    </div>
    <ul className="writing-legend">{seriesList.map((series, index) => <li key={index}>
      <span aria-hidden="true" style={{ backgroundColor: colors[index % colors.length] }} />{series.label}
    </li>)}</ul>
    <details className="writing-data"><summary lang={language}>{t.data}</summary>
      <div className="writing-table-scroll"><table>
        <caption>{material.title}{material.unit ? ` (${material.unit})` : ""}</caption>
        <thead><tr><th scope="col" lang={language}>{t.category}</th>{seriesList.map((series, index) => <th scope="col" key={index}>{series.label}</th>)}</tr></thead>
        <tbody>{categories.map((category, index) => <tr key={index}><th scope="row">{category}</th>
          {seriesList.map((series, seriesIndex) => <td key={seriesIndex}>{series.values[index]}</td>)}
        </tr>)}</tbody>
      </table></div>
    </details>
  </figure>;
}
