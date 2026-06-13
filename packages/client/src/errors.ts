import type { IppResponseMessage, StatusCodeName } from '@ipp/protocol';
import { getAttr, getGroup } from '@ipp/protocol';

export class IppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class IppTransportError extends IppError {
  constructor(
    message: string,
    public readonly httpStatusCode: number,
  ) {
    super(message);
  }
}

export class IppOperationError extends IppError {
  public readonly statusCode: StatusCodeName;
  public readonly response: IppResponseMessage;

  constructor(response: IppResponseMessage) {
    const detail = readStatusMessage(response);
    super(
      `IPP operation failed: ${response.statusCode}${detail ? ` — ${detail}` : ''}`,
    );
    this.statusCode = response.statusCode;
    this.response   = response;
  }
}

function readStatusMessage(resp: IppResponseMessage): string | undefined {
  const opGroup = getGroup(resp, 'operation-attributes-tag');
  if (!opGroup) return undefined;
  const attr = getAttr(opGroup, 'status-message');
  const val  = attr?.values[0];
  return val?.tag === 'textWithoutLanguage' ? val.value : undefined;
}
