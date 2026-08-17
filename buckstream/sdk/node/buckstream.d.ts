export class BuckStreamClient {
  brokerUrl: string;
  authToken: string | null;

  /**
   * @param brokerUrl - The base URL of the running BuckStream broker.
   * @param authToken - Optional auth token for secure write operations.
   */
  constructor(brokerUrl: string, authToken?: string);

  /**
   * Automatically executes the 2-step upload protocol (Intent check -> Direct/Proxy Upload).
   */
  Upload(
    file: Blob | File | ArrayBuffer | Uint8Array,
    filename: string,
    contentType: string
  ): Promise<{ status: string; key: string; action: string }>;

  /**
   * Downloads/retrieves an object's response stream.
   */
  Download(key: string): Promise<Response>;

  /**
   * Lists uploaded files.
   */
  List(): Promise<{ status: string; objects: string[] }>;

  /**
   * Deletes an object by key.
   */
  Delete(key: string): Promise<{ status: string; key: string; message: string }>;
}
