export interface SearchResultItem {
  fileId: string;
  fileName: string;
  similarity: number;
  snippets: string[];
}
