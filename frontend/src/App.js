import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FileUpload = () => {
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const fileInputRef = useRef(null);

  // Fetch uploaded files on component mount
  useEffect(() => {
    fetchUploadedFiles();
  }, []);

  const fetchUploadedFiles = async () => {
    try {
      const response = await axios.get(`${API}/files`);
      setUploadedFiles(response.data);
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  };

  const handleFiles = (selectedFiles) => {
    const fileArray = Array.from(selectedFiles);
    setFiles(prev => [...prev, ...fileArray]);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
      
      const response = await axios.post(`${API}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(prev => ({ ...prev, [file.name]: percentCompleted }));
        },
      });

      setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      return response.data;
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadProgress(prev => ({ ...prev, [file.name]: -1 }));
      throw error;
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const results = [];

    try {
      for (const file of files) {
        try {
          const result = await uploadFile(file);
          results.push(result);
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
        }
      }

      // Clear uploaded files and refresh list
      setFiles([]);
      setUploadProgress({});
      await fetchUploadedFiles();
      
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const deleteFile = async (fileId) => {
    try {
      await axios.delete(`${API}/files/${fileId}`);
      await fetchUploadedFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            <span className="text-blue-600">File</span>Share
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Upload and share your files instantly. Generate secure download links and share them with anyone.
          </p>
        </div>

        {/* Upload Section */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Upload Files</h2>
            
            {/* Drag and Drop Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="space-y-4">
                <div className="text-6xl text-gray-400">
                  📁
                </div>
                <div>
                  <p className="text-xl font-semibold text-gray-700 mb-2">
                    Drop files here or click to browse
                  </p>
                  <p className="text-gray-500">
                    Support for any file type, any size
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
                >
                  Choose Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            </div>

            {/* Selected Files */}
            {files.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Selected Files ({files.length})
                </h3>
                <div className="space-y-3">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">📄</div>
                        <div>
                          <p className="font-medium text-gray-800">{file.name}</p>
                          <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {uploadProgress[file.name] !== undefined && (
                          <div className="flex items-center space-x-2">
                            {uploadProgress[file.name] === -1 ? (
                              <span className="text-red-500 text-sm">Failed</span>
                            ) : uploadProgress[file.name] === 100 ? (
                              <span className="text-green-500 text-sm">✓ Complete</span>
                            ) : (
                              <span className="text-blue-500 text-sm">{uploadProgress[file.name]}%</span>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700 text-xl"
                          disabled={isUploading}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={handleUpload}
                  disabled={isUploading || files.length === 0}
                  className="mt-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
                >
                  {isUploading ? 'Uploading...' : `Upload ${files.length} File${files.length > 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Uploaded Files Section */}
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Your Files</h2>
              <button
                onClick={fetchUploadedFiles}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>

            {uploadedFiles.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-300 mb-4">📂</div>
                <p className="text-xl text-gray-500">No files uploaded yet</p>
                <p className="text-gray-400">Upload some files to get started!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="text-3xl">
                          {file.mime_type.startsWith('image/') ? '🖼️' :
                           file.mime_type.startsWith('video/') ? '🎥' :
                           file.mime_type.startsWith('audio/') ? '🎵' :
                           file.mime_type.includes('pdf') ? '📄' :
                           file.mime_type.includes('text') ? '📝' : '📁'}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800">{file.original_filename}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <span>{formatFileSize(file.file_size)}</span>
                            <span>•</span>
                            <span>{new Date(file.upload_date).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{file.download_count} downloads</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => copyToClipboard(file.download_link)}
                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          Copy Link
                        </button>
                        <a
                          href={file.download_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-green-100 hover:bg-green-200 text-green-700 font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => deleteFile(file.id)}
                          className="bg-red-100 hover:bg-red-200 text-red-700 font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <FileUpload />
    </div>
  );
}

export default App;