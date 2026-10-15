export type ContentKind = "log" | "test" | "file" | "generic";

export type ShrinkMethod = "passthrough" | "press" | "gloss" | "cache";

export type ShrinkReceipt = {
  kind: ContentKind;
  method: ShrinkMethod;
  bytesIn: number;
  bytesOut: number;
  model?: string;
  warning?: string;
};

export type ShrinkResult = {
  text: string;
  receipt: ShrinkReceipt;
};
