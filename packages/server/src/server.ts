import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import { parse, serialize } from '@ipp/codec';
import type { IppRequestMessage } from '@ipp/protocol';
import type { MockPrinter } from './mock-printer.js';

/**
 * Thin Node.js HTTP wrapper around MockPrinter.
 *
 * Accepts IPP-over-HTTP POST requests, parses the binary body, calls
 * `printer.handle()`, and serializes the response back.
 *
 * For framework integration (Express / Fastify / plain http.Server),
 * use `toNodeHandler()` to get a standard `(req, res) => void` function.
 */
export class IppServer {
  private server: http.Server;

  constructor(private readonly printer: MockPrinter) {
    this.server = http.createServer(this.toNodeHandler());
  }

  /** Start listening. Resolves when the server is ready. */
  listen(port = 0, hostname = '127.0.0.1'): Promise<{ port: number; hostname: string }> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, hostname, () => {
        const addr = this.server.address() as { port: number; address: string };
        resolve({ port: addr.port, hostname: addr.address });
      });
    });
  }

  /** Stop the server. */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  /** The underlying Node.js http.Server (for testing with supertest etc.). */
  get httpServer(): http.Server { return this.server; }

  /**
   * Returns a plain `(req, res) => void` handler suitable for use with
   * any Node.js HTTP framework.
   *
   * @example
   * app.post('/ipp', ippServer.toNodeHandler());
   */
  toNodeHandler(): (req: IncomingMessage, res: ServerResponse) => void {
    return (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end('Method Not Allowed');
        return;
      }

      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.includes('application/ipp')) {
        res.writeHead(415);
        res.end('Unsupported Media Type — expected application/ipp');
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('error', (err) => {
        res.writeHead(500);
        res.end(err.message);
      });
      req.on('end', () => {
        try {
          const body     = Buffer.concat(chunks);
          const ippReq   = parse(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));

          if (!('operation' in ippReq) || ippReq.operation === undefined) {
            res.writeHead(400);
            res.end('Expected IPP request (with operation field)');
            return;
          }

          const ippResp  = this.printer.handle(ippReq as IppRequestMessage);
          const respBody = serialize(ippResp);

          res.writeHead(200, {
            'Content-Type':   'application/ipp',
            'Content-Length': respBody.length,
          });
          res.end(Buffer.from(respBody));
        } catch (err) {
          res.writeHead(500);
          res.end(err instanceof Error ? err.message : 'Internal server error');
        }
      });
    };
  }
}
