export type MatchTier = "command" | "keyword" | "semantic" | null;

export type MatchResult = {
  tier: MatchTier;
  kind: "command" | "auto";
  content: string | null;
  similarity?: number;
  matchedTags?: string[];
  matchedHeading?: string;
  commandPhrase?: string;
  message?: string;
};

export type DisplayContent = {
  title?: string;
  content: string;
  source?: string;
  kind?: "command" | "auto";
};
