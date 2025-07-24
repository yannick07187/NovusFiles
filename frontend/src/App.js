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
  const [copySuccess, setCopySuccess] = useState("");
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
      setCopySuccess("Link copied!");
      setTimeout(() => setCopySuccess(""), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopySuccess("Copy failed");
      setTimeout(() => setCopySuccess(""), 2000);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-purple-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-4">
            <span className="text-purple-400">Novus</span><span className="text-white">Files</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Advanced file sharing platform. Upload instantly, share securely, access anywhere.
          </p>
          <div className="mt-4 text-purple-300 text-sm">
            ⚡ Secure • Fast • Reliable
          </div>
        </div>

        {/* Copy Success Notification */}
        {copySuccess && (
          <div className="fixed top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse">
            {copySuccess}
          </div>
        )}

        {/* Upload Section */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-2xl shadow-2xl border border-purple-500/20 p-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="text-purple-400 mr-3">📤</span>
              Upload Files
            </h2>
            
            {/* Drag and Drop Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                dragActive
                  ? 'border-purple-400 bg-purple-900/20 shadow-lg shadow-purple-500/20'
                  : 'border-gray-600 hover:border-purple-500 hover:bg-gray-800/30'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="space-y-4">
                <div className="text-6xl text-purple-400 animate-pulse">
                  🗂️
                </div>
                <div>
                  <p className="text-xl font-semibold text-white mb-2">
                    Drop files here or click to browse
                  </p>
                  <p className="text-gray-400">
                    Support for any file type • Unlimited size • Secure storage
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transform hover:scale-105"
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
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <span className="text-purple-400 mr-2">📋</span>
                  Selected Files ({files.length})
                </h3>
                <div className="space-y-3">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-900/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700/50">
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">📄</div>
                        <div>
                          <p className="font-medium text-white">{file.name}</p>
                          <p className="text-sm text-gray-400">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {uploadProgress[file.name] !== undefined && (
                          <div className="flex items-center space-x-2">
                            {uploadProgress[file.name] === -1 ? (
                              <span className="text-red-400 text-sm">❌ Failed</span>
                            ) : uploadProgress[file.name] === 100 ? (
                              <span className="text-green-400 text-sm">✅ Complete</span>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span className="text-purple-400 text-sm">{uploadProgress[file.name]}%</span>
                                <div className="w-16 bg-gray-700 rounded-full h-2">
                                  <div 
                                    className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress[file.name]}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-400 hover:text-red-300 text-xl hover:bg-red-900/20 rounded-full w-8 h-8 flex items-center justify-center transition-all"
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
                  className="mt-6 bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300 shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transform hover:scale-105 disabled:transform-none disabled:shadow-none"
                >
                  {isUploading ? (
                    <span className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Uploading...
                    </span>
                  ) : (
                    `🚀 Upload ${files.length} File${files.length > 1 ? 's' : ''}`
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Uploaded Files Section */}
        <div className="max-w-6xl mx-auto">
          <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-2xl shadow-2xl border border-purple-500/20 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <span className="text-purple-400 mr-3">🗃️</span>
                Your Files
              </h2>
              <button
                onClick={fetchUploadedFiles}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 border border-gray-600 hover:border-purple-500"
              >
                🔄 Refresh
              </button>
            </div>

            {uploadedFiles.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-600 mb-4">📂</div>
                <p className="text-xl text-gray-400 mb-2">No files uploaded yet</p>
                <p className="text-gray-500">Upload some files to get started with NovusFiles!</p>
                <div className="mt-6 text-sm text-purple-400">
                  ✨ Your files will appear here once uploaded
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="border border-gray-700/50 rounded-lg p-4 hover:bg-gray-800/30 hover:border-purple-500/30 transition-all duration-300 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="text-3xl">
                          {file.mime_type.startsWith('image/') ? '🖼️' :
                           file.mime_type.startsWith('video/') ? '🎥' :
                           file.mime_type.startsWith('audio/') ? '🎵' :
                           file.mime_type.includes('pdf') ? '📄' :
                           file.mime_type.includes('text') ? '📝' : 
                           file.mime_type.includes('zip') || file.mime_type.includes('rar') ? '📦' : '🗂️'}
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{file.original_filename}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-400">
                            <span className="flex items-center">
                              <span className="text-purple-400 mr-1">💾</span>
                              {formatFileSize(file.file_size)}
                            </span>
                            <span>•</span>
                            <span className="flex items-center">
                              <span className="text-purple-400 mr-1">📅</span>
                              {new Date(file.upload_date).toLocaleDateString()}
                            </span>
                            <span>•</span>
                            <span className="flex items-center">
                              <span className="text-purple-400 mr-1">📊</span>
                              {file.download_count} downloads
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => copyToClipboard(file.download_link)}
                          className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 hover:text-purple-200 font-medium py-2 px-4 rounded-lg transition-all duration-300 border border-purple-500/30 hover:border-purple-400 backdrop-blur-sm"
                        >
                          📋 Copy Link
                        </button>
                        <a
                          href={file.download_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-green-600/20 hover:bg-green-600/40 text-green-300 hover:text-green-200 font-medium py-2 px-4 rounded-lg transition-all duration-300 border border-green-500/30 hover:border-green-400 backdrop-blur-sm"
                        >
                          ⬇️ Download
                        </a>
                        <button
                          onClick={() => deleteFile(file.id)}
                          className="bg-red-600/20 hover:bg-red-600/40 text-red-300 hover:text-red-200 font-medium py-2 px-4 rounded-lg transition-all duration-300 border border-red-500/30 hover:border-red-400 backdrop-blur-sm"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500">
          <p className="text-sm">
            Powered by <span className="text-purple-400 font-semibold">NovusFiles</span> • 
            Secure file sharing platform
          </p>
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