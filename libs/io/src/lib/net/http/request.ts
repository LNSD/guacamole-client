export type OnErrorCallback = (req: XMLHttpRequest) => void;
export type OnLoadingCallback = (req: XMLHttpRequest, previousLength: number) => void;
export type OnCompleteCallback = (req: XMLHttpRequest, previousLength: number) => void;

export interface HttpRequest {
  onComplete: OnCompleteCallback | null;
  onError: OnErrorCallback | null;
  onLoading: OnLoadingCallback | null;

  status: number;

  send(): void;
  abort(): void;
}
