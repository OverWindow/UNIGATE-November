import type { ReactNode } from "react";
import ExamAccess from "@/components/pbt/ExamAccess";
import "./pbt.css";

export default function Layout({ children }: { children: ReactNode }) {
  return <ExamAccess examFormat="pbt">{children}</ExamAccess>;
}
