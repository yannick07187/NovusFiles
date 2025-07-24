from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import aiofiles
import secrets
import mimetypes
import hashlib
from urllib.parse import quote

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create uploads directory
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Models
class FileMetadata(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    original_filename: str
    stored_filename: str
    file_size: int
    mime_type: str
    upload_date: datetime = Field(default_factory=datetime.utcnow)
    download_token: str
    download_count: int = 0
    file_hash: str

class FileMetadataCreate(BaseModel):
    original_filename: str
    file_size: int
    mime_type: str

class FileInfo(BaseModel):
    id: str
    original_filename: str
    file_size: int
    mime_type: str
    upload_date: datetime
    download_count: int
    download_link: str

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Utility functions
def generate_download_token():
    """Generate a secure random token for download links"""
    return secrets.token_urlsafe(32)

def get_file_hash(file_path: Path) -> str:
    """Generate SHA256 hash of file for integrity checking"""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()

def format_file_size(size_bytes: int) -> str:
    """Convert bytes to human readable format"""
    if size_bytes == 0:
        return "0B"
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    return f"{size_bytes:.1f}{size_names[i]}"

# Routes
@api_router.get("/")
async def root():
    return {"message": "File Sharing API - Ready to upload!"}

@api_router.post("/upload", response_model=FileInfo)
async def upload_file(request: Request, file: UploadFile = File(...)):
    """Upload a file and return download information"""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Generate unique stored filename
        file_extension = Path(file.filename).suffix
        stored_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = UPLOAD_DIR / stored_filename
        
        # Get file content and size
        file_content = await file.read()
        file_size = len(file_content)
        
        # Detect MIME type
        mime_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
        
        # Save file to disk
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        
        # Generate file hash
        file_hash = get_file_hash(file_path)
        
        # Generate download token
        download_token = generate_download_token()
        
        # Create file metadata
        file_metadata = FileMetadata(
            original_filename=file.filename,
            stored_filename=stored_filename,
            file_size=file_size,
            mime_type=mime_type,
            download_token=download_token,
            file_hash=file_hash
        )
        
        # Save to database
        await db.files.insert_one(file_metadata.dict())
        
        # Generate download link
        base_url = str(request.base_url).rstrip('/')
        download_link = f"{base_url}/api/download/{download_token}"
        
        logger.info(f"File uploaded: {file.filename} ({format_file_size(file_size)})")
        
        return FileInfo(
            id=file_metadata.id,
            original_filename=file_metadata.original_filename,
            file_size=file_metadata.file_size,
            mime_type=file_metadata.mime_type,
            upload_date=file_metadata.upload_date,
            download_count=file_metadata.download_count,
            download_link=download_link
        )
        
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api_router.get("/download/{token}")
async def download_file(token: str):
    """Download file using secure token"""
    try:
        # Find file by download token
        file_doc = await db.files.find_one({"download_token": token})
        if not file_doc:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_metadata = FileMetadata(**file_doc)
        file_path = UPLOAD_DIR / file_metadata.stored_filename
        
        # Check if file exists on disk
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File no longer available")
        
        # Increment download count
        await db.files.update_one(
            {"download_token": token},
            {"$inc": {"download_count": 1}}
        )
        
        # Return file with proper headers
        return FileResponse(
            path=str(file_path),
            filename=file_metadata.original_filename,
            media_type=file_metadata.mime_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file_metadata.original_filename)}",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "no-cache"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        raise HTTPException(status_code=500, detail="Download failed")

@api_router.get("/files", response_model=List[FileInfo])
async def list_files(request: Request, limit: int = 50):
    """List all uploaded files"""
    try:
        files_cursor = db.files.find().sort("upload_date", -1).limit(limit)
        files_list = await files_cursor.to_list(length=limit)
        
        base_url = str(request.base_url).rstrip('/')
        result = []
        
        for file_doc in files_list:
            file_metadata = FileMetadata(**file_doc)
            download_link = f"{base_url}/api/download/{file_metadata.download_token}"
            
            result.append(FileInfo(
                id=file_metadata.id,
                original_filename=file_metadata.original_filename,
                file_size=file_metadata.file_size,
                mime_type=file_metadata.mime_type,
                upload_date=file_metadata.upload_date,
                download_count=file_metadata.download_count,
                download_link=download_link
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"List files error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list files")

@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """Delete a file"""
    try:
        # Find file by ID
        file_doc = await db.files.find_one({"id": file_id})
        if not file_doc:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_metadata = FileMetadata(**file_doc)
        file_path = UPLOAD_DIR / file_metadata.stored_filename
        
        # Delete from database
        await db.files.delete_one({"id": file_id})
        
        # Delete from disk if exists
        if file_path.exists():
            file_path.unlink()
        
        logger.info(f"File deleted: {file_metadata.original_filename}")
        return {"message": "File deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete error: {str(e)}")
        raise HTTPException(status_code=500, detail="Delete failed")

@api_router.get("/file-info/{token}")
async def get_file_info(token: str):
    """Get file information without downloading"""
    try:
        file_doc = await db.files.find_one({"download_token": token})
        if not file_doc:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_metadata = FileMetadata(**file_doc)
        
        return {
            "filename": file_metadata.original_filename,
            "size": file_metadata.file_size,
            "size_formatted": format_file_size(file_metadata.file_size),
            "type": file_metadata.mime_type,
            "upload_date": file_metadata.upload_date,
            "download_count": file_metadata.download_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File info error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get file info")

# Original status check routes
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()