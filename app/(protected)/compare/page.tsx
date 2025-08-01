import { Metadata } from "next"
import { ModelCompare } from "./_components/model-compare"

export const metadata: Metadata = {
  title: "Model Comparison | AI Studio",
  description: "Compare responses from different AI models side-by-side",
}

export default function ComparePage() {
  return <ModelCompare />
}