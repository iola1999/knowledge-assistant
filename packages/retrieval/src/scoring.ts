import crypto from "node:crypto";

export type RetrievalPointPayloadForScoring = {
  document_path: string;
  section_label: string | null;
  heading_path: string[];
  keywords: string[];
  chunk_text: string;
};

export function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeToken(token: string) {
  return token.trim().toLowerCase();
}

export function uniqueNormalized(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalized = normalizeToken(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function extractChineseBigrams(text: string) {
  const chars = Array.from(text.match(/\p{Script=Han}/gu) ?? []);
  const tokens = new Set<string>();

  for (let index = 0; index < chars.length; index += 1) {
    tokens.add(chars[index]!);
    if (index < chars.length - 1) {
      tokens.add(`${chars[index]}${chars[index + 1]}`);
    }
  }

  return Array.from(tokens);
}

export function extractStructuredTokens(text: string) {
  const normalized = normalizeWhitespace(text).toLowerCase();
  const asciiTokens = normalized.match(/[a-z0-9]+(?:[._/-][a-z0-9]+)*/g) ?? [];
  const numberedClauses =
    normalized.match(
      /第[\d一二三四五六七八九十百千零〇]+[条款项章编节]|[0-9]+(?:\.[0-9]+){1,4}/g,
    ) ?? [];
  const chinesePhrases =
    normalized.match(/[\p{Script=Han}]{2,12}/gu)?.flatMap((phrase) => {
      if (phrase.length <= 2) {
        return [phrase];
      }

      const phrases = new Set<string>([phrase]);
      for (let index = 0; index < phrase.length - 1; index += 1) {
        phrases.add(phrase.slice(index, index + 2));
      }
      return Array.from(phrases);
    }) ?? [];

  return uniqueNormalized([
    ...asciiTokens,
    ...numberedClauses,
    ...extractChineseBigrams(normalized),
    ...chinesePhrases,
  ]);
}

export function buildDirectoryPrefixes(directoryPath: string, documentPath: string) {
  const normalizedDirectory = directoryPath.replace(/^\/+|\/+$/g, "");
  const normalizedDocumentPath = documentPath.replace(/^\/+|\/+$/g, "");
  const source =
    normalizedDirectory || normalizedDocumentPath.split("/").slice(0, -1).join("/");

  if (!source) {
    return [];
  }

  const segments = source.split("/").filter(Boolean);
  const prefixes: string[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    prefixes.push(segments.slice(0, index + 1).join("/"));
  }

  return prefixes;
}

export function l2Normalize(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export function buildHashedEmbedding(text: string, dimensions: number) {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = extractStructuredTokens(text);

  if (!tokens.length) {
    return vector;
  }

  for (const token of tokens) {
    const digest = crypto.createHash("sha1").update(token).digest();
    const bucket = digest.readUInt32BE(0) % dimensions;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    const weight =
      token.length >= 6 || /^第.+[条款项章编节]$/.test(token) || /\d+\.\d+/.test(token)
        ? 2
        : 1;

    vector[bucket] += sign * weight;
  }

  return l2Normalize(vector);
}

export function chunkTextSnippet(text: string, maxLength = 320) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function textContainsToken(text: string, token: string) {
  if (!token) {
    return false;
  }
  return normalizeToken(text).includes(normalizeToken(token));
}

function countTokenOccurrences(text: string, token: string) {
  const normalizedText = normalizeToken(text);
  const normalizedToken = normalizeToken(token);

  if (!normalizedText || !normalizedToken) {
    return 0;
  }

  let count = 0;
  let fromIndex = 0;

  while (fromIndex < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedToken, fromIndex);
    if (matchIndex === -1) {
      break;
    }

    count += 1;
    fromIndex = matchIndex + normalizedToken.length;
  }

  return count;
}

export function computeBm25SparseScores(
  query: string,
  documents: string[],
  options?: {
    k1?: number;
    b?: number;
  },
) {
  if (!documents.length) {
    return [];
  }

  const queryTokens = uniqueNormalized(extractStructuredTokens(query));
  if (!queryTokens.length) {
    return documents.map(() => 0);
  }

  const k1 = options?.k1 ?? 1.2;
  const b = options?.b ?? 0.75;
  const normalizedDocuments = documents.map((document) => normalizeWhitespace(document));
  const documentLengths = normalizedDocuments.map(
    (document) => Math.max(extractStructuredTokens(document).length, 1),
  );
  const averageDocumentLength =
    documentLengths.reduce((sum, value) => sum + value, 0) / documentLengths.length;
  const documentFrequencies = new Map(
    queryTokens.map((token) => [
      token,
      normalizedDocuments.filter((candidate) => textContainsToken(candidate, token)).length,
    ]),
  );

  const scores = normalizedDocuments.map((document, documentIndex) => {
    let score = 0;

    for (const token of queryTokens) {
      const documentFrequency = documentFrequencies.get(token) ?? 0;

      if (documentFrequency === 0) {
        continue;
      }

      const termFrequency = countTokenOccurrences(document, token);
      if (termFrequency === 0) {
        continue;
      }

      const inverseDocumentFrequency = Math.log(
        1 + (normalizedDocuments.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
      );
      const normalization =
        k1 * (1 - b + b * (documentLengths[documentIndex]! / averageDocumentLength));

      score +=
        inverseDocumentFrequency *
        ((termFrequency * (k1 + 1)) / (termFrequency + normalization));
    }

    return score;
  });

  const maxScore = Math.max(...scores);
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return documents.map(() => 0);
  }

  return scores.map((score) => Number((score / maxScore).toFixed(6)));
}

export function computeKeywordScore(
  query: string,
  payload: RetrievalPointPayloadForScoring,
) {
  const queryTokens = extractStructuredTokens(query);

  if (!queryTokens.length) {
    return 0;
  }

  const sectionText = [
    payload.document_path,
    payload.section_label ?? "",
    ...payload.heading_path,
    ...payload.keywords,
    payload.chunk_text,
  ]
    .join("\n")
    .toLowerCase();

  let exactHits = 0;
  let headingHits = 0;

  for (const token of queryTokens) {
    if (!textContainsToken(sectionText, token)) {
      continue;
    }

    exactHits += 1;
    if (
      textContainsToken(payload.section_label ?? "", token) ||
      payload.heading_path.some((item) => textContainsToken(item, token))
    ) {
      headingHits += 1;
    }
  }

  const exactRatio = exactHits / queryTokens.length;
  const headingRatio = headingHits / queryTokens.length;
  return Math.min(1, exactRatio * 0.75 + headingRatio * 0.25);
}
