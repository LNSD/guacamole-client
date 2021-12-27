import { HttpRequest, OnCompleteCallback, OnErrorCallback, OnLoadingCallback } from './request';
import { HttpRequestFactory } from './factory';
import { DefaultRequestConfig, RequestConfig } from './config';

class XHR implements HttpRequest {
  onComplete: OnCompleteCallback | null = null;
  onError: OnErrorCallback | null = null;
  onLoading: OnLoadingCallback | null = null;

  private previousLength = 0;

  // // Also poll every 30ms (some browsers don't repeatedly call onreadystatechange for new data)
  // private readyStatePolling = true;
  // private readyStatePollingCounter = 0;
  // private readyStatePollingInterval?: number;

  constructor(
    private readonly request: XMLHttpRequest,
    private readonly data: XMLHttpRequestBodyInit | null | undefined
  ) {
    this.request.onreadystatechange = () => {
      this.handleOnReadyStateChange(request);
    };
  }

  get status(): number {
    return this.request.status;
  }

  send(): void {
    this.request.send(this.data);
  }

  abort(): void {
    // clearInterval(this.readyStatePollingInterval);

    this.request.onreadystatechange = null;
    this.request.abort();
  }

  private handleOnReadyStateChange(req: XMLHttpRequest): void {
    // Do not parse response yet if not ready
    if (req.readyState < 2) {
      return;
    }

    // Attempt to read status
    let status: number;
    try {
      status = req.status;
    } catch (_: unknown) {
      // If status could not be read, assume successful.
      status = 200;
    }

    if (status < 200 || status >= 300) {
      if (this.onError !== null) {
        this.onError(this.request);
      }

      // clearInterval(this.readyStatePollingInterval);
      return;
    }

    // Also poll every 30ms (some browsers don't repeatedly call onreadystatechange for new data)
    // if (this.readyStatePollingInterval === undefined && this.readyStatePolling) {
    //   this.readyStatePollingInterval = window.setInterval(() => this.handleOnReadyStateChange(this.request), 30);
    // }

    switch (req.readyState) {
      case XMLHttpRequest.LOADING:
        if (this.onLoading !== null) {
          this.onLoading(this.request, this.previousLength);
        }

        this.previousLength = req.responseText.length;

        // Disable readyState polling if LOADING<3> state is called more than once
        // if (this.readyStatePolling) {
        //   this.readyStatePollingCounter += 1;
        //   if (this.readyStatePollingCounter >= 2) {
        //     this.readyStatePolling = false;
        //   }
        // }

        return;

      case XMLHttpRequest.DONE:
        if (this.onComplete !== null) {
          this.onComplete(this.request, this.previousLength);
        }

        // clearInterval(this.readyStatePollingInterval);
        return;

      default:
        return;
    }
  }
}

const factory: HttpRequestFactory = (conf: RequestConfig): HttpRequest => {
  const url = new URL(conf.url, conf.baseURL);
  const req = new XMLHttpRequest();
  req.open(conf.method, url);

  if (conf.headers !== undefined) {
    for (const name in conf.headers) {
      req.setRequestHeader(name, conf.headers[name]);
    }
  }

  if (conf.timeout !== undefined) {
    req.timeout = conf.timeout;
  }

  if (conf.withCredentials !== undefined) {
    req.withCredentials = conf.withCredentials;
  }

  return new XHR(req, conf.data);
};

const xhr = Object.assign(factory, {
  create: (defaults?: DefaultRequestConfig): HttpRequestFactory => (config: RequestConfig) => factory({
    ...defaults,
    ...config,
    headers: {
      ...defaults?.headers ?? {},
      ...config.headers
    }
  })
});

export default xhr;
