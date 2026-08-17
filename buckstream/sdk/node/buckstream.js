/**
 * Isomorphic BuckStream Client SDK
 * Works in both Browser (Frontend) and Node.js 18+ (Backend).
 */
export class BuckStreamClient {
  /**
   * @param {string} brokerUrl - The base URL of the running BuckStream broker (e.g. "https://broker.example.com")
   * @param {string} [authToken] - Optional auth token for secure write operations.
   */
  constructor(brokerUrl, authToken) {
    this.brokerUrl = brokerUrl.replace(/\/$/, "");
    this.authToken = authToken || null;
  }

  /**
   * Automatically executes the 2-step upload protocol (Intent check -> Direct/Proxy Upload).
   * 
   * @param {Blob | File | ArrayBuffer | Buffer} file - The file content to upload.
   * @param {string} filename - The target filename.
   * @param {string} contentType - The MIME type (e.g. 'image/jpeg').
   * @returns {Promise<{ status: string, key: string }>}
   */
  async Upload(file, filename, contentType) {
    // 1. Determine size dynamically based on file type (works in Browser & Node)
    let size = 0;
    if (file.size !== undefined) {
      size = file.size; // HTML5 File/Blob
    } else if (file.byteLength !== undefined) {
      size = file.byteLength; // ArrayBuffer
    } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
      size = file.length; // Node.js Buffer
    } else {
      throw new Error("Unsupported file format. Must be Blob, File, ArrayBuffer, or Buffer.");
    }

    // 2. Step 1: Request Upload Intent from the Broker
    const headers = { "Content-Type": "application/json" };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const intentResponse = await fetch(`${this.brokerUrl}/api/upload-intent`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        filename: filename,
        content_type: contentType,
        size: size,
      }),
    });

    if (!intentResponse.ok) {
      const errMsg = await intentResponse.text();
      throw new Error(`Failed to initialize upload intent: ${errMsg}`);
    }

    const { action, upload_url } = await intentResponse.json();

    // Resolve target endpoint (proxy routes are relative path strings)
    const targetUrl = action === "proxy" ? `${this.brokerUrl}${upload_url}` : upload_url;

    // 3. Step 2: Upload raw file stream/buffer to target
    const uploadHeaders = { "Content-Type": contentType };
    // Only send Auth token to our broker proxy, never to S3/GCS directly
    if (action === "proxy" && this.authToken) {
      uploadHeaders["Authorization"] = `Bearer ${this.authToken}`;
    }

    const uploadResponse = await fetch(targetUrl, {
      method: "PUT",
      headers: uploadHeaders,
      body: file,
    });

    if (!uploadResponse.ok) {
      const errMsg = await uploadResponse.text();
      throw new Error(`Upload failed: ${errMsg}`);
    }

    return {
      status: "success",
      key: filename,
      action: action,
    };
  }

  /**
   * Downloads/retrieves an object's response stream.
   * 
   * @param {string} key - The key of the object to retrieve (e.g. "uploads/file.png").
   * @returns {Promise<Response>} - The HTTP fetch Response object.
   */
  async Download(key) {
    const headers = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${this.brokerUrl}/api/download/${key}`, {
      headers: headers,
    });

    if (!response.ok) {
      const errMsg = await response.text();
      throw new Error(`Download failed: ${errMsg}`);
    }

    return response;
  }

  /**
   * Lists uploaded files.
   * 
   * @returns {Promise<{ status: string, objects: string[] }>}
   */
  async List() {
    const headers = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${this.brokerUrl}/api/list`, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      const errMsg = await response.text();
      throw new Error(`List failed: ${errMsg}`);
    }

    return await response.json();
  }

  /**
   * Deletes an object by key.
   * 
   * @param {string} key - The file key (e.g. "uploads/avatar.jpg" or "avatar.jpg").
   * @returns {Promise<{ status: string, key: string, message: string }>}
   */
  async Delete(key) {
    const targetKey = key.startsWith("uploads/") ? key : `uploads/${key}`;
    const headers = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${this.brokerUrl}/api/delete?key=${encodeURIComponent(targetKey)}`, {
      method: "DELETE",
      headers: headers,
    });

    if (!response.ok) {
      const errMsg = await response.text();
      throw new Error(`Delete failed: ${errMsg}`);
    }

    return await response.json();
  }
}
