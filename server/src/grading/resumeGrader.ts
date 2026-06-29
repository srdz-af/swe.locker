export type ResumeRank = "S" | "A" | "B" | "C";

export type ResumeGradeMetric = {
  label: string;
  value: number;
};

export type ResumeGradeResult = {
  grade: number;
  rank: ResumeRank;
  verdict: string;
  metrics: ResumeGradeMetric[];
};

const resumeRanks: ResumeRank[] = ["S", "A", "B", "C"];
const resumeMetricLabels = ["Structure", "Impact", "Evidence", "Specificity", "Relevance"];

export function gradeResume(_input: { sourceName: string; parsedText: string }): ResumeGradeResult {
  return {
    grade: randomScore(),
    rank: resumeRanks[randomInteger(0, resumeRanks.length - 1)],
    verdict: "Temporary random grading result.",
    metrics: resumeMetricLabels.map((label) => ({
      label,
      value: randomScore()
    }))
  };
}

function randomScore() {
  return randomInteger(0, 100);
}

function randomInteger(minimum: number, maximum: number) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}
