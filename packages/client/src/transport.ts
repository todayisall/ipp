export interface TransportOptions {
  timeout?: number;
  signal?: AbortSignal;
  auth?: { username: string; password: string };
  tls?: {
    /** Default: true. Set false only for dev/testing with self-signed certs. */
    rejectUnauthorized?: boolean;
    /** PEM-encoded CA certificate for custom trust anchors. */
    ca?: Uint8Array;
  };
}

export interface ITransport {
  send(url: string, body: Uint8Array, options?: TransportOptions): Promise<Uint8Array>;
}
