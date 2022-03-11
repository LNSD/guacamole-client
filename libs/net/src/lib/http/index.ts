export type { DefaultRequestConfig, RequestConfig, Method } from './config';
export type {
  HttpRequest,
  OnLoadingCallback,
  OnCompleteCallback,
  OnErrorCallback,
} from './request';
export type { HttpRequestFactory } from './factory';

export { default as xhr } from './xhr';
