import React, { useState, useRef, useEffect } from 'react';
import { BuckStreamClient } from 'buckstream-client';

const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://localhost:8080';
const UPLOAD_TOKEN = import.meta.env.VITE_UPLOAD_TOKEN || '';
const client = new BuckStreamClient(BROKER_URL, UPLOAD_TOKEN);

function App() {
  // Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadMethod, setUploadMethod] = useState<'proxy' | 'direct' | ''>('');
  const [uploadedKey, setUploadedKey] = useState('');

  // Download State
  const [downloadKey, setDownloadKey] = useState('');
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadPreviewUrl, setDownloadPreviewUrl] = useState('');
  const [downloadMimeType, setDownloadMimeType] = useState('');

  // List State
  const [files, setFiles] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropUpload = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setUploadedKey(e.dataTransfer.files[0].name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadedKey(e.target.files[0].name);
    }
  };

  // Perform Upload using SDK
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadLoading(true);
    setUploadError('');
    setUploadStatus('Requesting upload intent from broker...');
    setUploadMethod('');

    try {
      const result = await client.Upload(
        selectedFile,
        uploadedKey,
        selectedFile.type || 'application/octet-stream'
      );

      setUploadMethod(result.action as 'proxy' | 'direct');
      setUploadStatus(`File uploaded successfully! Key: ${result.key}`);
      setDownloadKey(result.key); // Full key already includes uploads/ prefix
      
      // Auto-refresh files
      handleListFiles();
    } catch (err: any) {
      setUploadError(err.message || 'An error occurred during upload.');
      setUploadStatus('');
    } finally {
      setUploadLoading(false);
    }
  };

  // Perform Download/Retrieve from broker
  const handleDownload = async (keyOverride?: string) => {
    const targetKey = keyOverride || downloadKey;
    if (!targetKey) return;
    setDownloadLoading(true);
    setDownloadError('');
    setDownloadPreviewUrl('');
    setDownloadStatus('Fetching file stream from broker...');

    try {
      const response = await client.Download(targetKey);

      const contentType = response.headers.get('Content-Type') || '';
      setDownloadMimeType(contentType);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setDownloadPreviewUrl(objectUrl);
      setDownloadStatus('File retrieved successfully!');
    } catch (err: any) {
      setDownloadError(err.message || 'An error occurred during retrieval.');
      setDownloadStatus('');
    } finally {
      setDownloadLoading(false);
    }
  };

  // Download file to local disk programmatically
  const handleDownloadToDisk = async (key: string) => {
    try {
      const response = await client.Download(key);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = key.split('/').pop() || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      alert(err.message || 'Failed to download file.');
    }
  };

  // List files using SDK
  const handleListFiles = async () => {
    setListLoading(true);
    setListError('');
    try {
      const result = await client.List();
      setFiles(result.objects || []);
    } catch (err: any) {
      setListError(err.message || 'Failed to list uploaded files.');
    } finally {
      setListLoading(false);
    }
  };

  // Delete file using SDK
  const handleDeleteFile = async (key: string) => {
    if (!window.confirm(`Are you sure you want to delete "${key}"?`)) return;
    try {
      await client.Delete(key);
      handleListFiles();
    } catch (err: any) {
      alert(err.message || 'Failed to delete file.');
    }
  };

  // Fetch list on mount
  useEffect(() => {
    handleListFiles();
  }, []);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <header className="header">
        <h1>BuckStream Play</h1>
        <p>Stateless Storage Broker Console</p>
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#60a5fa' }}>
          Connected to: <code>{BROKER_URL}</code>
        </div>
      </header>

      {/* 1. File Upload Simulation */}
      <section className="card">
        <h2 className="section-title">Upload File (Intent-Based Flow)</h2>
        <div
          className="upload-zone"
          onDragOver={handleDragOver}
          onDrop={handleDropUpload}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="upload-icon">📥</span>
          <p style={{ margin: 0, fontWeight: 500 }}>
            {selectedFile ? selectedFile.name : 'Drag & Drop file here, or click to browse'}
          </p>
          {selectedFile && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB | {selectedFile.type || 'unknown type'}
            </p>
          )}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {selectedFile && (
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="uploadedKey">Overwrite Destination Filename</label>
            <input
              id="uploadedKey"
              type="text"
              className="form-input"
              value={uploadedKey}
              onChange={(e) => setUploadedKey(e.target.value)}
            />
          </div>
        )}

        <button
          className="btn"
          disabled={!selectedFile || uploadLoading}
          onClick={handleUpload}
        >
          {uploadLoading ? 'Uploading...' : 'Upload File'}
        </button>

        {/* Upload Feedback */}
        {(uploadStatus || uploadError || uploadMethod) && (
          <div className={`status-box ${uploadError ? 'status-error' : uploadStatus ? 'status-success' : ''}`}>
            {uploadError && <div><strong>Error:</strong> {uploadError}</div>}
            {uploadStatus && <div><strong>Status:</strong> {uploadStatus}</div>}
            {uploadMethod && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Upload Strategy:</span>
                <span className={`badge ${uploadMethod === 'proxy' ? 'badge-proxy' : 'badge-direct'}`}>
                  {uploadMethod}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                  ({selectedFile && selectedFile.size <= 5 * 1024 * 1024 ? 'Size ≤ 5MB' : 'Size > 5MB'})
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. Files Explorer (List & Delete) */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Files Explorer</h2>
          <button
            className="btn"
            style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem' }}
            onClick={handleListFiles}
            disabled={listLoading}
          >
            {listLoading ? 'Refreshing...' : '🔄 Refresh List'}
          </button>
        </div>

        {listError && (
          <div className="status-box status-error">
            <strong>Error:</strong> {listError}
          </div>
        )}

        {files.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', margin: '2rem 0' }}>No uploaded files found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {files.map((fileKey) => (
              <div
                key={fileKey}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div style={{ wordBreak: 'break-all', paddingRight: '1rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                  {fileKey}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn"
                    style={{
                      width: 'auto',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    }}
                    onClick={() => {
                      setDownloadKey(fileKey);
                      handleDownload(fileKey);
                    }}
                  >
                    Preview
                  </button>
                  <button
                    className="btn"
                    style={{
                      width: 'auto',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    }}
                    onClick={() => handleDownloadToDisk(fileKey)}
                  >
                    Download
                  </button>
                  <button
                    className="btn"
                    style={{
                      width: 'auto',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    }}
                    onClick={() => handleDeleteFile(fileKey)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. File Retrieval & Download Simulation */}
      <section className="card">
        <h2 className="section-title">Download File (Proxy / Redirect Flow)</h2>
        <div className="form-group">
          <label htmlFor="downloadKey">Storage Key / Path</label>
          <input
            id="downloadKey"
            type="text"
            className="form-input"
            placeholder="e.g. uploads/image.png"
            value={downloadKey}
            onChange={(e) => setDownloadKey(e.target.value)}
          />
        </div>

        <button
          className="btn"
          disabled={!downloadKey || downloadLoading}
          onClick={() => handleDownload()}
        >
          {downloadLoading ? 'Retrieving...' : 'Retrieve & Preview'}
        </button>

        {/* Download Feedback */}
        {(downloadStatus || downloadError) && (
          <div className={`status-box ${downloadError ? 'status-error' : downloadStatus ? 'status-success' : ''}`}>
            {downloadError && <div><strong>Error:</strong> {downloadError}</div>}
            {downloadStatus && <div><strong>Status:</strong> {downloadStatus}</div>}
          </div>
        )}

        {/* File Preview */}
        {downloadPreviewUrl && (
          <div className="preview-container" style={{ position: 'relative', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
              <a
                href={downloadPreviewUrl}
                download={downloadKey.split('/').pop() || 'download'}
                className="btn"
                style={{
                  width: 'auto',
                  padding: '0.4rem 1rem',
                  fontSize: '0.85rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                💾 Save to Disk
              </a>
            </div>
            {downloadMimeType.startsWith('image/') ? (
              <img src={downloadPreviewUrl} alt="Preview" className="preview-img" />
            ) : downloadMimeType.startsWith('text/') || downloadMimeType === 'application/json' ? (
              <iframe
                title="text-preview"
                src={downloadPreviewUrl}
                style={{ width: '100%', height: '300px', border: 'none', background: '#fff' }}
              />
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <span style={{ fontSize: '2rem' }}>📄</span>
                <p style={{ margin: '0.5rem 0 0 0' }}>Preview not available for MIME-type:</p>
                <code>{downloadMimeType || 'unknown'}</code>
                <p style={{ margin: '1rem 0 0 0' }}>
                  Preview not supported for this type. Please use the Save button above to download.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
