import React, { useState, useEffect, useRef, useContext, createContext } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // Verify token and get user info
      axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        setUser(response.data);
        setLoading(false);
      })
      .catch(() => {
        // Token is invalid
        localStorage.removeItem('token');
        setToken(null);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (username, password, stayLoggedIn) => {
    try {
      const response = await axios.post(`${API}/auth/login`, {
        username,
        password,
        stay_logged_in: stayLoggedIn
      });
      
      const { access_token, user: userData } = response.data;
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Login failed' 
      };
    }
  };

  const register = async (username, password) => {
    try {
      await axios.post(`${API}/auth/register`, {
        username,
        password
      });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Auth Components
const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isLogin) {
      const result = await login(username, password, stayLoggedIn);
      if (!result.success) {
        setError(result.error);
      }
    } else {
      const result = await register(username, password);
      if (result.success) {
        setIsLogin(true);
        setError('');
        setUsername('');
        setPassword('');
      } else {
        setError(result.error);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-purple-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            <span className="text-purple-400">Novus</span><span className="text-white">Files</span>
          </h1>
          <p className="text-gray-300 text-sm md:text-base">
            Secure file sharing platform
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-2xl shadow-2xl border border-purple-500/20 p-6 md:p-8">
          <div className="flex mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 text-sm md:text-base font-medium rounded-l-lg transition-all ${
                isLogin
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 text-sm md:text-base font-medium rounded-r-lg transition-all ${
                !isLogin
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 md:px-4 md:py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm md:text-base"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 md:px-4 md:py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm md:text-base"
                placeholder="Enter your password"
                required
              />
            </div>

            {isLogin && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="stayLoggedIn"
                  checked={stayLoggedIn}
                  onChange={(e) => setStayLoggedIn(e.target.checked)}
                  className="w-4 h-4 text-purple-600 bg-gray-900 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                />
                <label htmlFor="stayLoggedIn" className="ml-2 text-sm text-gray-300">
                  Stay logged in for 30 days
                </label>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transform hover:scale-105 disabled:transform-none disabled:shadow-none text-sm md:text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {isLogin ? 'Logging in...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? '🔐 Login' : '📝 Create Account'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// Main File Upload Component
const FileUpload = () => {
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [copySuccess, setCopySuccess] = useState("");
  const fileInputRef = useRef(null);
  const { user, logout, token } = useAuth();

  // Fetch uploaded files on component mount
  useEffect(() => {
    fetchUploadedFiles();
  }, []);

  const fetchUploadedFiles = async () => {
    try {
      const response = await axios.get(`${API}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
          'Authorization': `Bearer ${token}`
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
      await axios.delete(`${API}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchUploadedFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-purple-900">
      <div className="container mx-auto px-3 md:px-4 py-4 md:py-8">
        {/* Header with User Info */}
        <div className="text-center mb-8 md:mb-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 md:mb-0">
              <span className="text-purple-400">Novus</span><span className="text-white">Files</span>
            </h1>
            <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-4">
              <span className="text-gray-300 text-sm md:text-base">
                Welcome, <span className="text-purple-400 font-semibold">{user?.username}</span>
              </span>
              <button
                onClick={logout}
                className="bg-red-600/20 hover:bg-red-600/40 text-red-300 hover:text-red-200 font-medium py-2 px-3 md:px-4 rounded-lg transition-all duration-300 border border-red-500/30 hover:border-red-400 backdrop-blur-sm text-sm md:text-base"
              >
                🚪 Logout
              </button>
            </div>
          </div>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-2">
            Advanced file sharing platform. Upload instantly, share securely, access anywhere.
          </p>
          <div className="text-purple-300 text-xs md:text-sm">
            ⚡ Secure • Fast • Private
          </div>
        </div>

        {/* Copy Success Notification */}
        {copySuccess && (
          <div className="fixed top-4 right-4 bg-purple-600 text-white px-3 py-2 md:px-4 md:py-2 rounded-lg shadow-lg z-50 animate-pulse text-sm md:text-base">
            {copySuccess}
          </div>
        )}

        {/* Upload Section */}
        <div className="max-w-4xl mx-auto mb-8 md:mb-12">
          <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-2xl shadow-2xl border border-purple-500/20 p-4 md:p-8">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6 flex items-center">
              <span className="text-purple-400 mr-3 text-lg md:text-xl">📤</span>
              Upload Files
            </h2>
            
            {/* Drag and Drop Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-6 md:p-12 text-center transition-all duration-300 ${
                dragActive
                  ? 'border-purple-400 bg-purple-900/20 shadow-lg shadow-purple-500/20'
                  : 'border-gray-600 hover:border-purple-500 hover:bg-gray-800/30'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="space-y-3 md:space-y-4">
                <div className="text-4xl md:text-6xl text-purple-400 animate-pulse">
                  🗂️
                </div>
                <div>
                  <p className="text-lg md:text-xl font-semibold text-white mb-2">
                    Drop files here or click to browse
                  </p>
                  <p className="text-gray-400 text-sm md:text-base">
                    Support for any file type • Unlimited size • Secure storage
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-semibold py-3 px-6 md:px-8 rounded-lg transition-all duration-300 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transform hover:scale-105 text-sm md:text-base"
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
              <div className="mt-6 md:mt-8">
                <h3 className="text-base md:text-lg font-semibold text-white mb-4 flex items-center">
                  <span className="text-purple-400 mr-2">📋</span>
                  Selected Files ({files.length})
                </h3>
                <div className="space-y-3">
                  {files.map((file, index) => (
                    <div key={index} className="flex flex-col md:flex-row md:items-center md:justify-between bg-gray-900/50 backdrop-blur-sm rounded-lg p-3 md:p-4 border border-gray-700/50 space-y-2 md:space-y-0">
                      <div className="flex items-center space-x-3">
                        <div className="text-xl md:text-2xl">📄</div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white text-sm md:text-base truncate">{file.name}</p>
                          <p className="text-xs md:text-sm text-gray-400">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end space-x-3">
                        {uploadProgress[file.name] !== undefined && (
                          <div className="flex items-center space-x-2 flex-1 md:flex-none">
                            {uploadProgress[file.name] === -1 ? (
                              <span className="text-red-400 text-xs md:text-sm">❌ Failed</span>
                            ) : uploadProgress[file.name] === 100 ? (
                              <span className="text-green-400 text-xs md:text-sm">✅ Complete</span>
                            ) : (
                              <div className="flex items-center space-x-2 flex-1 md:flex-none">
                                <span className="text-purple-400 text-xs md:text-sm">{uploadProgress[file.name]}%</span>
                                <div className="w-16 md:w-16 bg-gray-700 rounded-full h-2">
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
                          className="text-red-400 hover:text-red-300 text-lg md:text-xl hover:bg-red-900/20 rounded-full w-6 h-6 md:w-8 md:h-8 flex items-center justify-center transition-all flex-shrink-0"
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
                  className="mt-4 md:mt-6 w-full md:w-auto bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-6 md:px-8 rounded-lg transition-all duration-300 shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transform hover:scale-105 disabled:transform-none disabled:shadow-none text-sm md:text-base"
                >
                  {isUploading ? (
                    <span className="flex items-center justify-center">
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
          <div className="bg-gray-800 bg-opacity-50 backdrop-blur-sm rounded-2xl shadow-2xl border border-purple-500/20 p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 md:mb-6 space-y-2 md:space-y-0">
              <h2 className="text-xl md:text-2xl font-bold text-white flex items-center">
                <span className="text-purple-400 mr-3">🗃️</span>
                Your Files
              </h2>
              <button
                onClick={fetchUploadedFiles}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white font-medium py-2 px-3 md:px-4 rounded-lg transition-all duration-300 border border-gray-600 hover:border-purple-500 text-sm md:text-base"
              >
                🔄 Refresh
              </button>
            </div>

            {uploadedFiles.length === 0 ? (
              <div className="text-center py-8 md:py-12">
                <div className="text-4xl md:text-6xl text-gray-600 mb-4">📂</div>
                <p className="text-lg md:text-xl text-gray-400 mb-2">No files uploaded yet</p>
                <p className="text-gray-500 text-sm md:text-base">Upload some files to get started with NovusFiles!</p>
                <div className="mt-4 md:mt-6 text-xs md:text-sm text-purple-400">
                  ✨ Your files will appear here once uploaded
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:gap-4">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="border border-gray-700/50 rounded-lg p-3 md:p-4 hover:bg-gray-800/30 hover:border-purple-500/30 transition-all duration-300 backdrop-blur-sm">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                      <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1">
                        <div className="text-2xl md:text-3xl flex-shrink-0">
                          {file.mime_type.startsWith('image/') ? '🖼️' :
                           file.mime_type.startsWith('video/') ? '🎥' :
                           file.mime_type.startsWith('audio/') ? '🎵' :
                           file.mime_type.includes('pdf') ? '📄' :
                           file.mime_type.includes('text') ? '📝' : 
                           file.mime_type.includes('zip') || file.mime_type.includes('rar') ? '📦' : '🗂️'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-white text-sm md:text-base truncate">{file.original_filename}</h3>
                          <div className="flex flex-col md:flex-row md:items-center md:space-x-4 text-xs md:text-sm text-gray-400 mt-1">
                            <span className="flex items-center">
                              <span className="text-purple-400 mr-1">💾</span>
                              {formatFileSize(file.file_size)}
                            </span>
                            <span className="hidden md:inline">•</span>
                            <span className="flex items-center">
                              <span className="text-purple-400 mr-1">📅</span>
                              {new Date(file.upload_date).toLocaleDateString()}
                            </span>
                            <span className="hidden md:inline">•</span>
                            <span className="flex items-center">
                              <span className="text-purple-400 mr-1">📊</span>
                              {file.download_count} downloads
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-3">
                        <button
                          onClick={() => copyToClipboard(file.download_link)}
                          className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 hover:text-purple-200 font-medium py-2 px-3 md:px-4 rounded-lg transition-all duration-300 border border-purple-500/30 hover:border-purple-400 backdrop-blur-sm text-xs md:text-sm"
                        >
                          📋 Copy Link
                        </button>
                        <a
                          href={file.download_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-green-600/20 hover:bg-green-600/40 text-green-300 hover:text-green-200 font-medium py-2 px-3 md:px-4 rounded-lg transition-all duration-300 border border-green-500/30 hover:border-green-400 backdrop-blur-sm text-center text-xs md:text-sm"
                        >
                          ⬇️ Download
                        </a>
                        <button
                          onClick={() => deleteFile(file.id)}
                          className="bg-red-600/20 hover:bg-red-600/40 text-red-300 hover:text-red-200 font-medium py-2 px-3 md:px-4 rounded-lg transition-all duration-300 border border-red-500/30 hover:border-red-400 backdrop-blur-sm text-xs md:text-sm"
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
        <div className="text-center mt-8 md:mt-12 text-gray-500">
          <p className="text-xs md:text-sm">
            Powered by <span className="text-purple-400 font-semibold">NovusFiles</span> • 
            Secure private file sharing
          </p>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <div className="App">
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </div>
  );
}

const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto mb-4"></div>
          <p className="text-white">Loading NovusFiles...</p>
        </div>
      </div>
    );
  }

  return user ? <FileUpload /> : <AuthForm />;
};

export default App;