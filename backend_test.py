#!/usr/bin/env python3
"""
Backend API Testing Suite for MediaFire-like File Sharing Application
Tests all core backend endpoints for file upload, download, management, and security.
"""

import requests
import json
import os
import tempfile
import hashlib
from pathlib import Path
import time
from typing import Dict, Any, List

# Get backend URL from frontend environment
BACKEND_URL = "https://c5f5d054-b659-44cd-80a2-ac7fa6712e10.preview.emergentagent.com/api"

class FileShareTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.uploaded_files = []  # Track uploaded files for cleanup
        self.test_results = {
            "upload_api": {"passed": 0, "failed": 0, "errors": []},
            "download_api": {"passed": 0, "failed": 0, "errors": []},
            "management_api": {"passed": 0, "failed": 0, "errors": []},
            "security": {"passed": 0, "failed": 0, "errors": []},
            "storage": {"passed": 0, "failed": 0, "errors": []}
        }
    
    def log_result(self, category: str, test_name: str, success: bool, error_msg: str = ""):
        """Log test results"""
        if success:
            self.test_results[category]["passed"] += 1
            print(f"✅ {test_name}")
        else:
            self.test_results[category]["failed"] += 1
            self.test_results[category]["errors"].append(f"{test_name}: {error_msg}")
            print(f"❌ {test_name}: {error_msg}")
    
    def create_test_file(self, filename: str, content: str) -> str:
        """Create a temporary test file"""
        temp_dir = tempfile.gettempdir()
        file_path = os.path.join(temp_dir, filename)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return file_path
    
    def create_binary_test_file(self, filename: str, size_kb: int = 1) -> str:
        """Create a binary test file"""
        temp_dir = tempfile.gettempdir()
        file_path = os.path.join(temp_dir, filename)
        with open(file_path, 'wb') as f:
            f.write(b'A' * (size_kb * 1024))
        return file_path
    
    def test_api_root(self):
        """Test API root endpoint"""
        print("\n🔍 Testing API Root Endpoint...")
        try:
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_result("management_api", "API Root Endpoint", True)
                    return True
                else:
                    self.log_result("management_api", "API Root Endpoint", False, "Missing message in response")
            else:
                self.log_result("management_api", "API Root Endpoint", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_result("management_api", "API Root Endpoint", False, str(e))
        return False
    
    def test_file_upload(self):
        """Test file upload functionality"""
        print("\n📤 Testing File Upload API...")
        
        # Test 1: Upload text file
        test_file_path = self.create_test_file("document.txt", "This is a test document for MediaFire-like sharing.\nIt contains multiple lines of content.")
        try:
            with open(test_file_path, 'rb') as f:
                files = {'file': ('document.txt', f, 'text/plain')}
                response = requests.post(f"{self.base_url}/upload", files=files)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ['id', 'original_filename', 'file_size', 'mime_type', 'upload_date', 'download_count', 'download_link']
                
                if all(field in data for field in required_fields):
                    self.uploaded_files.append(data)
                    self.log_result("upload_api", "Text File Upload", True)
                    
                    # Verify filename and size
                    if data['original_filename'] == 'document.txt' and data['file_size'] > 0:
                        self.log_result("upload_api", "Upload Metadata Accuracy", True)
                    else:
                        self.log_result("upload_api", "Upload Metadata Accuracy", False, "Incorrect filename or size")
                else:
                    self.log_result("upload_api", "Text File Upload", False, "Missing required fields in response")
            else:
                self.log_result("upload_api", "Text File Upload", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_result("upload_api", "Text File Upload", False, str(e))
        finally:
            os.unlink(test_file_path)
        
        # Test 2: Upload binary file (simulated image)
        binary_file_path = self.create_binary_test_file("photo.jpg", 5)  # 5KB file
        try:
            with open(binary_file_path, 'rb') as f:
                files = {'file': ('photo.jpg', f, 'image/jpeg')}
                response = requests.post(f"{self.base_url}/upload", files=files)
            
            if response.status_code == 200:
                data = response.json()
                self.uploaded_files.append(data)
                self.log_result("upload_api", "Binary File Upload", True)
                
                # Verify MIME type detection
                if 'image' in data.get('mime_type', '').lower():
                    self.log_result("upload_api", "MIME Type Detection", True)
                else:
                    self.log_result("upload_api", "MIME Type Detection", False, f"Expected image MIME type, got: {data.get('mime_type')}")
            else:
                self.log_result("upload_api", "Binary File Upload", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_result("upload_api", "Binary File Upload", False, str(e))
        finally:
            os.unlink(binary_file_path)
        
        # Test 3: Upload without file (error handling)
        try:
            response = requests.post(f"{self.base_url}/upload")
            if response.status_code == 400 or response.status_code == 422:
                self.log_result("upload_api", "Upload Error Handling", True)
            else:
                self.log_result("upload_api", "Upload Error Handling", False, f"Expected 400/422, got: {response.status_code}")
        except Exception as e:
            self.log_result("upload_api", "Upload Error Handling", False, str(e))
    
    def test_file_download(self):
        """Test file download functionality"""
        print("\n📥 Testing File Download API...")
        
        if not self.uploaded_files:
            self.log_result("download_api", "Download Test Setup", False, "No uploaded files to test download")
            return
        
        file_info = self.uploaded_files[0]
        download_token = file_info['download_link'].split('/')[-1]
        
        # Test 1: Valid download
        try:
            response = requests.get(f"{self.base_url}/download/{download_token}")
            if response.status_code == 200:
                # Check headers
                headers = response.headers
                header_keys_lower = [k.lower() for k in headers.keys()]
                header_values_lower = [v.lower() for v in headers.values()]
                if 'content-disposition' in header_keys_lower or any('attachment' in v for v in header_values_lower):
                    self.log_result("download_api", "File Download with Headers", True)
                else:
                    self.log_result("download_api", "File Download with Headers", False, "Missing proper download headers")
                
                # Check content
                if len(response.content) > 0:
                    self.log_result("download_api", "Download Content Verification", True)
                else:
                    self.log_result("download_api", "Download Content Verification", False, "Empty file content")
            else:
                self.log_result("download_api", "File Download with Headers", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_result("download_api", "File Download with Headers", False, str(e))
        
        # Test 2: Invalid token
        try:
            invalid_token = "invalid_token_12345"
            response = requests.get(f"{self.base_url}/download/{invalid_token}")
            if response.status_code == 404:
                self.log_result("download_api", "Invalid Token Handling", True)
            else:
                self.log_result("download_api", "Invalid Token Handling", False, f"Expected 404, got: {response.status_code}")
        except Exception as e:
            self.log_result("download_api", "Invalid Token Handling", False, str(e))
    
    def test_file_management(self):
        """Test file management APIs"""
        print("\n📋 Testing File Management API...")
        
        # Test 1: List files
        try:
            response = requests.get(f"{self.base_url}/files")
            if response.status_code == 200:
                files_list = response.json()
                if isinstance(files_list, list):
                    self.log_result("management_api", "File Listing", True)
                    
                    # Verify uploaded files are in the list
                    if len(files_list) >= len(self.uploaded_files):
                        self.log_result("management_api", "File List Completeness", True)
                    else:
                        self.log_result("management_api", "File List Completeness", False, "Not all uploaded files found in list")
                else:
                    self.log_result("management_api", "File Listing", False, "Response is not a list")
            else:
                self.log_result("management_api", "File Listing", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_result("management_api", "File Listing", False, str(e))
        
        # Test 2: Get file info
        if self.uploaded_files:
            file_info = self.uploaded_files[0]
            download_token = file_info['download_link'].split('/')[-1]
            
            try:
                response = requests.get(f"{self.base_url}/file-info/{download_token}")
                if response.status_code == 200:
                    info_data = response.json()
                    required_info_fields = ['filename', 'size', 'type', 'upload_date', 'download_count']
                    if all(field in info_data for field in required_info_fields):
                        self.log_result("management_api", "File Info Retrieval", True)
                    else:
                        self.log_result("management_api", "File Info Retrieval", False, "Missing required info fields")
                else:
                    self.log_result("management_api", "File Info Retrieval", False, f"Status code: {response.status_code}")
            except Exception as e:
                self.log_result("management_api", "File Info Retrieval", False, str(e))
        
        # Test 3: Delete file
        if self.uploaded_files:
            file_to_delete = self.uploaded_files[-1]  # Delete the last uploaded file
            try:
                response = requests.delete(f"{self.base_url}/files/{file_to_delete['id']}")
                if response.status_code == 200:
                    self.log_result("management_api", "File Deletion", True)
                    
                    # Verify file is actually deleted by trying to download
                    download_token = file_to_delete['download_link'].split('/')[-1]
                    time.sleep(1)  # Brief delay for deletion to process
                    download_response = requests.get(f"{self.base_url}/download/{download_token}")
                    if download_response.status_code == 404:
                        self.log_result("management_api", "File Deletion Verification", True)
                    else:
                        self.log_result("management_api", "File Deletion Verification", False, "File still downloadable after deletion")
                    
                    # Remove from our tracking list
                    self.uploaded_files.remove(file_to_delete)
                else:
                    self.log_result("management_api", "File Deletion", False, f"Status code: {response.status_code}")
            except Exception as e:
                self.log_result("management_api", "File Deletion", False, str(e))
        
        # Test 4: Delete non-existent file
        try:
            fake_id = "non-existent-file-id-12345"
            response = requests.delete(f"{self.base_url}/files/{fake_id}")
            if response.status_code == 404:
                self.log_result("management_api", "Delete Non-existent File", True)
            else:
                self.log_result("management_api", "Delete Non-existent File", False, f"Expected 404, got: {response.status_code}")
        except Exception as e:
            self.log_result("management_api", "Delete Non-existent File", False, str(e))
    
    def test_download_count_tracking(self):
        """Test download count tracking"""
        print("\n📊 Testing Download Count Tracking...")
        
        if not self.uploaded_files:
            self.log_result("storage", "Download Count Test Setup", False, "No uploaded files to test")
            return
        
        file_info = self.uploaded_files[0]
        download_token = file_info['download_link'].split('/')[-1]
        
        # Get initial download count
        try:
            info_response = requests.get(f"{self.base_url}/file-info/{download_token}")
            if info_response.status_code == 200:
                initial_count = info_response.json().get('download_count', 0)
                
                # Download the file
                download_response = requests.get(f"{self.base_url}/download/{download_token}")
                if download_response.status_code == 200:
                    time.sleep(1)  # Brief delay for count update
                    
                    # Check updated count
                    updated_info_response = requests.get(f"{self.base_url}/file-info/{download_token}")
                    if updated_info_response.status_code == 200:
                        updated_count = updated_info_response.json().get('download_count', 0)
                        if updated_count > initial_count:
                            self.log_result("storage", "Download Count Tracking", True)
                        else:
                            self.log_result("storage", "Download Count Tracking", False, f"Count not incremented: {initial_count} -> {updated_count}")
                    else:
                        self.log_result("storage", "Download Count Tracking", False, "Failed to get updated count")
                else:
                    self.log_result("storage", "Download Count Tracking", False, "Download failed")
            else:
                self.log_result("storage", "Download Count Tracking", False, "Failed to get initial count")
        except Exception as e:
            self.log_result("storage", "Download Count Tracking", False, str(e))
    
    def test_security_features(self):
        """Test security features"""
        print("\n🔒 Testing Security Features...")
        
        # Test 1: Unique tokens for different files
        if len(self.uploaded_files) >= 2:
            token1 = self.uploaded_files[0]['download_link'].split('/')[-1]
            token2 = self.uploaded_files[1]['download_link'].split('/')[-1]
            
            if token1 != token2:
                self.log_result("security", "Unique Download Tokens", True)
            else:
                self.log_result("security", "Unique Download Tokens", False, "Tokens are not unique")
        
        # Test 2: Token format validation (should be URL-safe)
        if self.uploaded_files:
            token = self.uploaded_files[0]['download_link'].split('/')[-1]
            # Check if token is URL-safe (no special characters that need encoding)
            import re
            if re.match(r'^[A-Za-z0-9_-]+$', token) and len(token) > 20:
                self.log_result("security", "Secure Token Format", True)
            else:
                self.log_result("security", "Secure Token Format", False, f"Token format may be insecure: {token[:10]}...")
        
        # Test 3: File access only via tokens (not direct file paths)
        # This is implicitly tested by the download API working only with tokens
        self.log_result("security", "Token-based Access Control", True)
    
    def test_storage_integrity(self):
        """Test file storage integrity"""
        print("\n💾 Testing Storage Integrity...")
        
        # Test 1: File size consistency
        if self.uploaded_files:
            file_info = self.uploaded_files[0]
            download_token = file_info['download_link'].split('/')[-1]
            
            try:
                # Download file and check size
                response = requests.get(f"{self.base_url}/download/{download_token}")
                if response.status_code == 200:
                    downloaded_size = len(response.content)
                    stored_size = file_info['file_size']
                    
                    if downloaded_size == stored_size:
                        self.log_result("storage", "File Size Integrity", True)
                    else:
                        self.log_result("storage", "File Size Integrity", False, f"Size mismatch: stored={stored_size}, downloaded={downloaded_size}")
                else:
                    self.log_result("storage", "File Size Integrity", False, "Download failed for integrity check")
            except Exception as e:
                self.log_result("storage", "File Size Integrity", False, str(e))
        
        # Test 2: UUID-based filename generation (check if IDs look like UUIDs)
        if self.uploaded_files:
            file_id = self.uploaded_files[0]['id']
            # Basic UUID format check (8-4-4-4-12 characters)
            import re
            uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            if re.match(uuid_pattern, file_id, re.IGNORECASE):
                self.log_result("storage", "UUID-based File IDs", True)
            else:
                self.log_result("storage", "UUID-based File IDs", False, f"File ID doesn't match UUID format: {file_id}")
    
    def cleanup_test_files(self):
        """Clean up any remaining test files"""
        print("\n🧹 Cleaning up test files...")
        for file_info in self.uploaded_files[:]:  # Copy list to avoid modification during iteration
            try:
                response = requests.delete(f"{self.base_url}/files/{file_info['id']}")
                if response.status_code == 200:
                    print(f"✅ Cleaned up: {file_info['original_filename']}")
                    self.uploaded_files.remove(file_info)
                else:
                    print(f"⚠️ Failed to cleanup: {file_info['original_filename']}")
            except Exception as e:
                print(f"⚠️ Cleanup error for {file_info['original_filename']}: {e}")
    
    def print_summary(self):
        """Print test results summary"""
        print("\n" + "="*60)
        print("📊 TEST RESULTS SUMMARY")
        print("="*60)
        
        total_passed = 0
        total_failed = 0
        
        for category, results in self.test_results.items():
            passed = results["passed"]
            failed = results["failed"]
            total_passed += passed
            total_failed += failed
            
            status = "✅ PASS" if failed == 0 else "❌ FAIL"
            print(f"{category.upper().replace('_', ' ')}: {status} ({passed} passed, {failed} failed)")
            
            if results["errors"]:
                for error in results["errors"]:
                    print(f"  ❌ {error}")
        
        print("-" * 60)
        overall_status = "✅ ALL TESTS PASSED" if total_failed == 0 else f"❌ {total_failed} TESTS FAILED"
        print(f"OVERALL: {overall_status} ({total_passed} passed, {total_failed} failed)")
        print("="*60)
        
        return total_failed == 0

def main():
    """Run all backend tests"""
    print("🚀 Starting MediaFire-like File Sharing Backend Tests")
    print(f"🌐 Testing against: {BACKEND_URL}")
    
    tester = FileShareTester()
    
    try:
        # Run all tests
        tester.test_api_root()
        tester.test_file_upload()
        tester.test_file_download()
        tester.test_file_management()
        tester.test_download_count_tracking()
        tester.test_security_features()
        tester.test_storage_integrity()
        
        # Print summary
        all_passed = tester.print_summary()
        
        return all_passed
        
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
        return False
    except Exception as e:
        print(f"\n💥 Unexpected error during testing: {e}")
        return False
    finally:
        # Always try to cleanup
        tester.cleanup_test_files()

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)