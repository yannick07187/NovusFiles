from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Request, Depends, status
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import aiofiles
import secrets
import mimetypes
import hashlib
from urllib.parse import quote
import jwt
from passlib.context import CryptContext
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create uploads directory
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# JWT and Password settings
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'novusfiles-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
LONG_TOKEN_EXPIRE_DAYS = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

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
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str
    stay_logged_in: bool = False

class UserResponse(BaseModel):
    id: str
    username: str
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: UserResponse

class FileMetadata(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
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
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from JWT token"""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return User(**user)

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

# Authentication Routes
@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user_data: UserCreate):
    """Register a new user"""
    try:
        # Check if username already exists
        existing_user = await db.users.find_one({"username": user_data.username})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered"
            )
        
        # Create user
        hashed_password = get_password_hash(user_data.password)
        user = User(
            username=user_data.username,
            password_hash=hashed_password
        )
        
        # Save to database
        await db.users.insert_one(user.dict())
        
        logger.info(f"New user registered: {user_data.username}")
        
        return UserResponse(
            id=user.id,
            username=user.username,
            created_at=user.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail="Registration failed")

@api_router.post("/auth/login", response_model=Token)
async def login_user(user_data: UserLogin):
    """Login user and return JWT token"""
    try:
        # Find user
        user_doc = await db.users.find_one({"username": user_data.username})
        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )
        
        user = User(**user_doc)
        
        # Verify password
        if not verify_password(user_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )
        
        # Create access token
        if user_data.stay_logged_in:
            access_token_expires = timedelta(days=LONG_TOKEN_EXPIRE_DAYS)
            expires_in = LONG_TOKEN_EXPIRE_DAYS * 24 * 60 * 60  # seconds
        else:
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            expires_in = ACCESS_TOKEN_EXPIRE_MINUTES * 60  # seconds
            
        access_token = create_access_token(
            data={"sub": user.id}, expires_delta=access_token_expires
        )
        
        logger.info(f"User logged in: {user_data.username}")
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            expires_in=expires_in,
            user=UserResponse(
                id=user.id,
                username=user.username,
                created_at=user.created_at
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail="Login failed")

@api_router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        created_at=current_user.created_at
    )

# File Routes (now protected)
@api_router.get("/")
async def root():
    return {"message": "NovusFiles API - Secure file sharing with user accounts"}

@api_router.post("/upload", response_model=FileInfo)
async def upload_file(
    request: Request, 
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a file (protected endpoint)"""
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
        
        # Create file metadata (associated with current user)
        file_metadata = FileMetadata(
            user_id=current_user.id,
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
        
        logger.info(f"File uploaded by {current_user.username}: {file.filename} ({format_file_size(file_size)})")
        
        return FileInfo(
            id=file_metadata.id,
            original_filename=file_metadata.original_filename,
            file_size=file_metadata.file_size,
            mime_type=file_metadata.mime_type,
            upload_date=file_metadata.upload_date,
            download_count=file_metadata.download_count,
            download_link=download_link
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api_router.get("/download/{token}")
async def download_file(token: str):
    """Download file using secure token (no auth required for downloads)"""
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
async def list_files(
    request: Request, 
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """List files for current user only"""
    try:
        files_cursor = db.files.find({"user_id": current_user.id}).sort("upload_date", -1).limit(limit)
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
async def delete_file(file_id: str, current_user: User = Depends(get_current_user)):
    """Delete a file (only owner can delete)"""
    try:
        # Find file by ID and user_id
        file_doc = await db.files.find_one({"id": file_id, "user_id": current_user.id})
        if not file_doc:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_metadata = FileMetadata(**file_doc)
        file_path = UPLOAD_DIR / file_metadata.stored_filename
        
        # Delete from database
        await db.files.delete_one({"id": file_id, "user_id": current_user.id})
        
        # Delete from disk if exists
        if file_path.exists():
            file_path.unlink()
        
        logger.info(f"File deleted by {current_user.username}: {file_metadata.original_filename}")
        return {"message": "File deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete error: {str(e)}")
        raise HTTPException(status_code=500, detail="Delete failed")

@api_router.get("/file-info/{token}")
async def get_file_info(token: str):
    """Get file information without downloading (public endpoint)"""
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

# Original status check routes (for compatibility)
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