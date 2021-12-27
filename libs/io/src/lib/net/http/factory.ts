import { RequestConfig } from './config';
import { HttpRequest } from './request';

export type HttpRequestFactory = (config: RequestConfig) => HttpRequest;
