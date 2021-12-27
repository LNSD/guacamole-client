import { HttpRequest, HttpRequestFactory } from '@guacamole-client/io';

export interface GuacamoleHttpClient {
  connect(data?: any): HttpRequest;

  read(uuid: string, requestId: number): HttpRequest;

  write(uuid: string, data?: any): HttpRequest;
}

export class HttpClient implements GuacamoleHttpClient {
  private readonly withCredentials: boolean;
  private readonly headers: Record<string, string>;

  constructor(private readonly client: HttpRequestFactory, withCredentials = false, headers: Record<string, string> = {}) {
    this.withCredentials = withCredentials;
    this.headers = headers;
  }

  connect(data?: any): HttpRequest {
    return this.client({
      method: 'POST',
      url: 'tunnel?connect',
      headers: { 'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      data,
      withCredentials: this.withCredentials
    });
  }

  read(uuid: string, requestId: number): HttpRequest {
    return this.client({
      method: 'GET',
      url: `tunnel?read:${uuid}:${requestId}`,
      headers: this.headers,
      withCredentials: this.withCredentials
    });
  }

  write(uuid: string, data?: any): HttpRequest {
    return this.client({
      method: 'POST',
      url: `tunnel?write:${uuid}`,
      headers: { ...this.headers, 'Content-type': 'application/octet-stream' },
      data,
      withCredentials: this.withCredentials
    });
  }
}
