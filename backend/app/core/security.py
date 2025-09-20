from datetime import datetime, timedelta
from typing import Optional, Union, Set
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.hash import bcrypt
from fastapi import HTTPException, status
import secrets
import re

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class SecurityManager:
    def __init__(self):
        self.pwd_context = pwd_context
        self.secret_key = settings.secret_key
        self.algorithm = settings.algorithm
        self.access_token_expire_minutes = settings.access_token_expire_minutes
        # Token blacklist for logout functionality
        self.blacklisted_tokens: Set[str] = set()
        # Clean blacklist every hour
        self._last_cleanup = datetime.utcnow()

    def validate_password_strength(self, password: str) -> bool:
        """Validate password meets security requirements"""
        if len(password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters long"
            )

        if not re.search(r'[A-Z]', password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one uppercase letter"
            )

        if not re.search(r'[a-z]', password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one lowercase letter"
            )

        if not re.search(r'\d', password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one number"
            )

        # Check for common weak passwords
        weak_passwords = {'password', '12345678', 'qwerty123', 'admin123', 'password123'}
        if password.lower() in weak_passwords:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is too common. Please choose a stronger password"
            )

        return True

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a plain password against its hash"""
        try:
            return self.pwd_context.verify(plain_password, hashed_password)
        except Exception:
            return False

    def get_password_hash(self, password: str, skip_validation: bool = False) -> str:
        """Generate password hash with optional validation"""
        # Validate password strength before hashing (unless skipped for admin setup)
        if not skip_validation:
            self.validate_password_strength(password)
        return self.pwd_context.hash(password)

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        
        to_encode.update({"exp": expire, "iat": datetime.utcnow()})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt

    def blacklist_token(self, token: str) -> None:
        """Add token to blacklist for logout"""
        self.blacklisted_tokens.add(token)
        # Clean old tokens periodically
        self._cleanup_blacklist()

    def _cleanup_blacklist(self) -> None:
        """Remove expired tokens from blacklist"""
        current_time = datetime.utcnow()
        if (current_time - self._last_cleanup).total_seconds() > 3600:  # Clean every hour
            # Create new set to avoid modification during iteration
            valid_tokens = set()
            for token in self.blacklisted_tokens:
                try:
                    payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
                    if payload.get('exp', 0) > current_time.timestamp():
                        valid_tokens.add(token)
                except JWTError:
                    # Token is invalid/expired, don't add to valid_tokens
                    pass

            self.blacklisted_tokens = valid_tokens
            self._last_cleanup = current_time

    def is_token_blacklisted(self, token: str) -> bool:
        """Check if token is blacklisted"""
        return token in self.blacklisted_tokens

    def verify_token(self, token: str) -> Optional[dict]:
        """Verify JWT token and return payload"""
        try:
            # Check if token is blacklisted
            if self.is_token_blacklisted(token):
                return None

            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except JWTError:
            return None

    def generate_api_key(self) -> str:
        """Generate secure API key"""
        return secrets.token_urlsafe(32)

security = SecurityManager()