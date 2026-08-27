export interface CompiledToolContent {
  readonly category: string;
  readonly html: string;
  readonly markdown: string;
  readonly mcpId: string;
  readonly operationName: string;
  readonly related: readonly string[];
  readonly tags: readonly string[];
  readonly title: string;
}
