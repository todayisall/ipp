export type JobState =
  | 'pending'
  | 'pending-held'
  | 'processing'
  | 'processing-stopped'
  | 'canceled'
  | 'aborted'
  | 'completed';

export interface JobRecord {
  id: number;
  uri: string;
  state: JobState;
  stateReasons: string[];
  name: string;
  userName: string;
  documentFormat: string;
  copies: number;
  sides: string;
  media: string;
  priority: number;
  holdUntil: string;
  createdAt: Date;
  processingAt?: Date;
  completedAt?: Date;
  data?: Uint8Array;
  documentCount: number;
  closed: boolean;          // true once Send-Document with last-document=true, or Print-Job
  impressionsCompleted: number;
}

export type PrinterState = 'idle' | 'processing' | 'stopped';

export interface SubscriptionRecord {
  id: number;
  printerUri: string;
  notifyEvents: string[];
  pullMethod: string;           // 'ippget'
  recipientUri?: string;
  leaseDuration: number;        // seconds; 0 = indefinite
  leaseExpires: Date;
  userName: string;
  jobId?: number;               // set for job subscriptions
  sequenceNumber: number;
}

export interface ResolutionDef {
  x: number;
  y: number;
  unit: 'dpi' | 'dpcm';
}

export interface PrinterConfig {
  /** Full IPP printer URI, e.g. 'ipp://localhost:3631/ipp/printer' */
  printerUri: string;
  printerName?: string;
  makeAndModel?: string;
  info?: string;
  location?: string;
  moreInfo?: string;
  uuid?: string;
  colorSupported?: boolean;
  pagesPerMinute?: number;
  pagesPerMinuteColor?: number;
  documentFormats?: string[];
  documentFormatDefault?: string;
  mediaSupported?: string[];
  mediaDefault?: string;
  mediaReady?: string[];
  copiesSupported?: [number, number];
  sidesSupported?: string[];
  finishingsSupported?: string[];
  printQualitySupported?: string[];
  resolutionsSupported?: ResolutionDef[];
  resolutionDefault?: ResolutionDef;
  orientationsSupported?: string[];
  multipleDocumentJobsSupported?: boolean;
  /**
   * Automatically advance pending jobs through the state machine.
   * Default: true
   */
  autoProcessJobs?: boolean;
  /**
   * Delay in ms between job submission and processing start.
   * Default: 0
   */
  processingDelay?: number;
  /**
   * Delay in ms between processing start and completion.
   * Default: 10
   */
  completionDelay?: number;
}
