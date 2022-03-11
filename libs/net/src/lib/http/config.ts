export type Method =
  | 'get'
  | 'GET'
  | 'delete'
  | 'DELETE'
  | 'head'
  | 'HEAD'
  | 'options'
  | 'OPTIONS'
  | 'post'
  | 'POST'
  | 'put'
  | 'PUT'
  | 'patch'
  | 'PATCH'
  | 'connect'
  | 'CONNECT'
  | 'trace'
  | 'TRACE';

export interface DefaultRequestConfig {
  // `baseURL` will be prepended to `url` unless `url` is absolute.
  // to methods of that instance.
  // It can be convenient to set `baseURL` for an instance of axios to pass relative URLs
  baseURL?: string | URL;

  // `headers` are custom headers to be sent
  headers?: Record<string, string>;

  // `timeout` specifies the number of milliseconds before the request times out.
  // If the request takes longer than `timeout`, the request will be aborted.
  timeout?: number; // default is `0` (no timeout)
}

export interface RequestConfig extends DefaultRequestConfig {
  // `url` is the server URL that will be used for the request
  url: string | URL;

  // `baseURL` will be prepended to `url` unless `url` is absolute.
  // to methods of that instance.
  // It can be convenient to set `baseURL` for an instance of axios to pass relative URLs
  baseURL?: string | URL;

  // `method` is the request method to be used when making the request
  method: Method;

  // `headers` are custom headers to be sent
  headers?: Record<string, string>;

  // `data` is the data to be sent as the request body
  // Only applicable for request methods 'PUT', 'POST', 'DELETE , and 'PATCH'
  data?: string | URLSearchParams | FormData | File | Blob;

  // `timeout` specifies the number of milliseconds before the request times out.
  // If the request takes longer than `timeout`, the request will be aborted.
  timeout?: number; // default is `0` (no timeout)

  // `withCredentials` indicates whether or not cross-site Access-Control requests
  // should be made using credentials
  withCredentials?: boolean; // default
}
